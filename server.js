const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

// Configuración
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Contador local de escaneos
let contadorEscaneos = 0;
let contadorMayores = 0;
let contadorMenores = 0;
let contadorSalidas = 0;
let historialEscaneos = [];

// Set para trackear DNIs que están actualmente adentro
let dnisAdentro = new Set();

// Función para decodificar el PDF417 del DNI argentino
function decodificarDNI(codigoBarras) {
    try {
        // El código de barras PDF417 del DNI argentino tiene el formato:
        // @TRAMITE@APELLIDO@NOMBRE@SEXO@DNI@EJEMPLAR@FECHA_NAC@FECHA_EMISION@FECHA_VENC@CUIL@...
        const datos = codigoBarras.split('@');
        
        return {
            tramite: datos[0] || '',
            apellido: datos[1] || '',
            nombre: datos[2] || '',
            sexo: datos[3] || '',
            dni: datos[4] || '',
            ejemplar: datos[5] || '',
            fechaNacimiento: datos[6] || '',
            fechaEmision: datos[7] || '',
            fechaVencimiento: datos[8] || '',
            cuil: datos[9] || '',
            nacionalidad: datos[10] || '',
            lugarNacimiento: datos[11] || '',
            paisNacimiento: datos[12] || '',
            idTramite: datos[13] || '',
            imagenFirma: datos[14] || '',
            codigoVerificacion: datos[15] || '',
            datoCompleto: codigoBarras // Guardamos el código completo también
        };
    } catch (error) {
        console.error('Error al decodificar DNI:', error);
        return null;
    }
}

// Función para calcular edad
function calcularEdad(fechaNacimiento) {
    try {
        // Formato esperado: DD/MM/YYYY
        const partes = fechaNacimiento.split('/');
        const dia = parseInt(partes[0]);
        const mes = parseInt(partes[1]) - 1; // Mes es 0-indexed en JS
        const anio = parseInt(partes[2]);
        
        const fechaNac = new Date(anio, mes, dia);
        const hoy = new Date();
        
        let edad = hoy.getFullYear() - fechaNac.getFullYear();
        const mesActual = hoy.getMonth();
        const diaActual = hoy.getDate();
        
        if (mesActual < mes || (mesActual === mes && diaActual < dia)) {
            edad--;
        }
        
        return edad;
    } catch (error) {
        console.error('Error al calcular edad:', error);
        return 0;
    }
}

// Ruta principal - NO comparte contadores entre usuarios
// Cada cliente usa su propio localStorage
app.get('/', (req, res) => {
    res.render('index', { 
        contador: 0,
        contadorMayores: 0,
        contadorMenores: 0,
        contadorSalidas: 0,
        historial: [] // Cada cliente tiene su propio historial en localStorage
    });
});

// Endpoint para procesar el código de barras
app.post('/procesar-dni', (req, res) => {
    const { codigoBarras, contarMenores } = req.body;
    
    if (!codigoBarras) {
        return res.status(400).json({ 
            error: 'No se recibió código de barras',
            esMayorDeEdad: false 
        });
    }
    
    console.log('\n=================================');
    console.log('📷 NUEVO ESCANEO RECIBIDO');
    console.log('=================================');
    console.log('Código raw:', codigoBarras);
    console.log('Contar menores:', contarMenores ? 'SÍ' : 'NO');
    
    const datosPersona = decodificarDNI(codigoBarras);
    
    if (!datosPersona || !datosPersona.fechaNacimiento) {
        console.log('❌ Error: No se pudo decodificar el DNI');
        return res.status(400).json({ 
            error: 'Código de barras inválido',
            esMayorDeEdad: false 
        });
    }
    
    const edad = calcularEdad(datosPersona.fechaNacimiento);
    const esMayorDeEdad = edad >= 18;
    
    // La verificación de DNI duplicado se maneja en el cliente (localStorage)
    
    // NO incrementar contadores del servidor
    // Cada cliente maneja sus propios contadores en localStorage
    
    const registro = {
        timestamp: new Date().toLocaleString('es-AR'),
        ...datosPersona,
        edad,
        esMayorDeEdad
    };
    
    // LOG DETALLADO EN CONSOLA
    console.log('\n📋 DATOS EXTRAÍDOS DEL DNI:');
    console.log('=====================================');
    console.log('🔷 DATOS PERSONALES:');
    console.log(`👤 Nombre completo: ${datosPersona.nombre} ${datosPersona.apellido}`);
    console.log(`🆔 DNI: ${datosPersona.dni}`);
    console.log(`🎂 Fecha de Nacimiento: ${datosPersona.fechaNacimiento}`);
    console.log(`📅 Edad: ${edad} años`);
    console.log(`⚧️  Sexo: ${datosPersona.sexo === 'M' ? 'Masculino' : datosPersona.sexo === 'F' ? 'Femenino' : datosPersona.sexo}`);
    console.log(`� CUIL: ${datosPersona.cuil || 'No disponible'}`);
    console.log(`🌍 Nacionalidad: ${datosPersona.nacionalidad || 'No disponible'}`);
    console.log(`📍 Lugar de Nacimiento: ${datosPersona.lugarNacimiento || 'No disponible'}`);
    console.log(`🗺️  País de Nacimiento: ${datosPersona.paisNacimiento || 'No disponible'}`);
    console.log('\n🔷 DATOS DEL DOCUMENTO:');
    console.log(`�📄 Número de Trámite: ${datosPersona.tramite}`);
    console.log(`📌 Ejemplar: ${datosPersona.ejemplar}`);
    console.log(`📤 Fecha Emisión: ${datosPersona.fechaEmision}`);
    console.log(`📆 Vencimiento: ${datosPersona.fechaVencimiento}`);
    console.log(`🔢 ID Trámite: ${datosPersona.idTramite || 'No disponible'}`);
    
    if (esMayorDeEdad) {
        console.log('\n✅ ESTADO: MAYOR DE EDAD (18+)');
        console.log('🟢 Acceso permitido');
    } else {
        console.log('\n⚠️  ESTADO: MENOR DE EDAD');
        console.log('🔴 Acceso denegado');
    }
    
    console.log('\n📊 ESTADÍSTICAS:');
    console.log(`Total de escaneos: ${contadorEscaneos}`);
    console.log('=================================\n');
    
    // Respuesta al cliente - SIN contadores (se manejan en localStorage del cliente)
    res.json({
        success: true,
        datos: {
            // Datos personales
            nombreCompleto: `${datosPersona.nombre} ${datosPersona.apellido}`,
            nombre: datosPersona.nombre,
            apellido: datosPersona.apellido,
            dni: datosPersona.dni,
            edad,
            fechaNacimiento: datosPersona.fechaNacimiento,
            sexo: datosPersona.sexo,
            cuil: datosPersona.cuil,
            nacionalidad: datosPersona.nacionalidad,
            lugarNacimiento: datosPersona.lugarNacimiento,
            paisNacimiento: datosPersona.paisNacimiento,
            // Datos del documento
            tramite: datosPersona.tramite,
            ejemplar: datosPersona.ejemplar,
            fechaEmision: datosPersona.fechaEmision,
            fechaVencimiento: datosPersona.fechaVencimiento,
            idTramite: datosPersona.idTramite,
            esMayorDeEdad
        }
    });
});

// Endpoint para registrar salida - NO modifica contadores del servidor
app.post('/api/registrar-salida', (req, res) => {
    console.log('\n🚪 SALIDA REGISTRADA (manejado en cliente)');
    console.log('=================================\n');
    
    res.json({
        success: true
    });
});

// Endpoint para registrar entrada manual (sin DNI) - NO modifica contadores del servidor
app.post('/api/registrar-entrada-manual', (req, res) => {
    console.log('\n🟢 ENTRADA MANUAL REGISTRADA (manejado en cliente)');
    console.log('=================================\n');
    
    res.json({
        success: true
    });
});

// Endpoint para reiniciar contadores - NO hace nada en servidor (se maneja en cliente)
app.post('/api/reiniciar-contadores', (req, res) => {
    console.log('\n🔄 CONTADORES REINICIADOS (manejado en cliente)');
    console.log('=================================\n');
    
    res.json({
        success: true,
        message: 'Contadores reiniciados correctamente'
    });
});

// Endpoint para obtener estadísticas - Cada cliente usa su localStorage
app.get('/api/estadisticas', (req, res) => {
    res.json({
        message: 'Estadísticas manejadas en localStorage del cliente'
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log('\n🚀 ========================================');
    console.log('   LECTOR DE DNI ARGENTINO - ACTIVO');
    console.log('========================================');
    console.log(`📡 Servidor corriendo en: http://localhost:${PORT}`);
    console.log(`🕒 Iniciado: ${new Date().toLocaleString('es-AR')}`);
    console.log('========================================\n');
});
