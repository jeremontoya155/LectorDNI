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
let historialEscaneos = [];

// Función para decodificar el PDF417 del DNI argentino
function decodificarDNI(codigoBarras) {
    try {
        // El código de barras PDF417 del DNI argentino tiene el formato:
        // @APELLIDO@NOMBRE@SEXO@DNI@EJEMPLAR@FECHA_NAC@FECHA_EMISION@...
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
            fechaVencimiento: datos[8] || ''
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

// Ruta principal
app.get('/', (req, res) => {
    res.render('index', { 
        contador: contadorEscaneos,
        historial: historialEscaneos.slice(-10).reverse() // Últimos 10 escaneos
    });
});

// Endpoint para procesar el código de barras
app.post('/procesar-dni', (req, res) => {
    const { codigoBarras } = req.body;
    
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
    
    contadorEscaneos++;
    
    const registro = {
        timestamp: new Date().toLocaleString('es-AR'),
        contador: contadorEscaneos,
        ...datosPersona,
        edad,
        esMayorDeEdad
    };
    
    historialEscaneos.push(registro);
    
    // LOG DETALLADO EN CONSOLA
    console.log('\n📋 DATOS EXTRAÍDOS:');
    console.log('-----------------------------------');
    console.log(`👤 Nombre completo: ${datosPersona.nombre} ${datosPersona.apellido}`);
    console.log(`🆔 DNI: ${datosPersona.dni}`);
    console.log(`🎂 Fecha de Nacimiento: ${datosPersona.fechaNacimiento}`);
    console.log(`📅 Edad: ${edad} años`);
    console.log(`⚧️  Sexo: ${datosPersona.sexo}`);
    console.log(`📄 Trámite: ${datosPersona.tramite}`);
    console.log(`📌 Ejemplar: ${datosPersona.ejemplar}`);
    console.log(`📤 Fecha Emisión: ${datosPersona.fechaEmision}`);
    console.log(`📆 Vencimiento: ${datosPersona.fechaVencimiento}`);
    
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
    
    // Respuesta al cliente
    res.json({
        success: true,
        datos: {
            nombreCompleto: `${datosPersona.nombre} ${datosPersona.apellido}`,
            dni: datosPersona.dni,
            edad,
            fechaNacimiento: datosPersona.fechaNacimiento,
            sexo: datosPersona.sexo,
            esMayorDeEdad
        },
        contador: contadorEscaneos
    });
});

// Endpoint para obtener estadísticas
app.get('/api/estadisticas', (req, res) => {
    res.json({
        totalEscaneos: contadorEscaneos,
        historial: historialEscaneos.slice(-20).reverse()
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
