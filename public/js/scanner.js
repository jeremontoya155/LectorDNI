let codeReader = null;
let scanning = false;
let lastScannedCode = null;
let scanTimeout = null;
let autoScanTimeout = null;

// ===========================================
// DETECCIÓN DE DISPOSITIVO Y MODO DE ESCANEO
// ===========================================
let modoActual = 'camera'; // 'camera' o 'scanner'
let esColector = false;
let barcodeBuffer = '';
let barcodeTimeout = null;
const BARCODE_TIMEOUT = 100; // ms - tiempo máximo entre caracteres de un código
const MIN_BARCODE_LENGTH = 20; // Longitud mínima del código de barras del DNI

// ===========================================
// CONFIGURACIÓN Y LOCALSTORAGE
// ===========================================
const CONFIG_KEY = 'dniScanner_config';
const HISTORIAL_KEY = 'dniScanner_historial';
const SESSION_KEY = 'dniScanner_session';
const CONTADORES_KEY = 'dniScanner_contadores';
const DNIS_ADENTRO_KEY = 'dniScanner_dnisAdentro';

let config = {
    modoEscaneo: 'camera',
    habilitarCapacidad: false,
    capacidadMaxima: 5000,
    permitirIngresoSinDni: false
};

let historialLocal = [];

// Contadores locales (cada usuario tiene los suyos)
let contadoresLocales = {
    total: 0,
    mayores: 0,
    menores: 0,
    salidas: 0
};

// Set de DNIs adentro (localStorage)
let dnisAdentroLocal = new Set();

// Cargar contadores desde localStorage
function cargarContadores() {
    try {
        const savedContadores = localStorage.getItem(CONTADORES_KEY);
        if (savedContadores) {
            contadoresLocales = JSON.parse(savedContadores);
        }
        
        const savedDnis = localStorage.getItem(DNIS_ADENTRO_KEY);
        if (savedDnis) {
            dnisAdentroLocal = new Set(JSON.parse(savedDnis));
        }
        
        console.log('📊 Contadores cargados:', contadoresLocales);
    } catch (error) {
        console.error('Error cargando contadores:', error);
    }
}

// Guardar contadores en localStorage
function guardarContadores() {
    try {
        localStorage.setItem(CONTADORES_KEY, JSON.stringify(contadoresLocales));
        localStorage.setItem(DNIS_ADENTRO_KEY, JSON.stringify([...dnisAdentroLocal]));
    } catch (error) {
        console.error('Error guardando contadores:', error);
    }
}

// Actualizar contadores en la UI
function actualizarContadoresUI() {
    if (contadorTotal) contadorTotal.textContent = contadoresLocales.total;
    if (contadorMayores) contadorMayores.textContent = contadoresLocales.mayores;
    if (contadorMenores) contadorMenores.textContent = contadoresLocales.menores;
    if (contadorSalidas) contadorSalidas.textContent = contadoresLocales.salidas;
    verificarCapacidad();
}

// Cargar configuración desde localStorage
function cargarConfiguracion() {
    try {
        const savedConfig = localStorage.getItem(CONFIG_KEY);
        if (savedConfig) {
            config = { ...config, ...JSON.parse(savedConfig) };
        }
        
        const savedHistorial = localStorage.getItem(HISTORIAL_KEY);
        if (savedHistorial) {
            historialLocal = JSON.parse(savedHistorial);
        }
        
        console.log('📂 Configuración cargada:', config);
        console.log('📊 Historial cargado:', historialLocal.length, 'registros');
    } catch (error) {
        console.error('Error cargando configuración:', error);
    }
}

// Guardar configuración en localStorage
function guardarConfiguracion() {
    try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        localStorage.setItem(SESSION_KEY, new Date().toISOString());
        console.log('💾 Configuración guardada');
    } catch (error) {
        console.error('Error guardando configuración:', error);
    }
}

// Guardar historial en localStorage
function guardarHistorial() {
    try {
        localStorage.setItem(HISTORIAL_KEY, JSON.stringify(historialLocal));
        localStorage.setItem(SESSION_KEY, new Date().toISOString());
        actualizarInfoCache();
    } catch (error) {
        console.error('Error guardando historial:', error);
        // Si localStorage está lleno, intentar limpiarlo parcialmente
        if (error.name === 'QuotaExceededError') {
            alert('⚠️ Almacenamiento lleno. Descargá los datos y limpiá el caché.');
        }
    }
}

// Agregar escaneo al historial local
function agregarAHistorialLocal(datos) {
    const registro = {
        ...datos,
        timestamp: new Date().toISOString(),
        fecha: new Date().toLocaleDateString('es-AR'),
        hora: new Date().toLocaleTimeString('es-AR')
    };
    
    historialLocal.push(registro);
    guardarHistorial();
    verificarCapacidad();
}

// Verificar capacidad máxima
function verificarCapacidad() {
    const contadorActualElem = document.getElementById('capacidadActual');
    const alertaElem = document.getElementById('capacidadAlerta');
    const contadorCapacidadElem = document.getElementById('contadorCapacidad');
    
    if (config.habilitarCapacidad) {
        const actual = parseInt(contadorMayores?.textContent || '0');
        
        if (contadorActualElem) contadorActualElem.textContent = actual;
        if (contadorCapacidadElem) contadorCapacidadElem.style.display = 'flex';
        
        if (actual >= config.capacidadMaxima) {
            // Mostrar alerta de capacidad máxima
            if (alertaElem) {
                alertaElem.style.display = 'block';
                alertaElem.classList.add('pulse');
            }
            document.body.classList.add('capacidad-maxima');
            console.log('🚨 ¡CAPACIDAD MÁXIMA ALCANZADA!');
        } else {
            if (alertaElem) alertaElem.style.display = 'none';
            document.body.classList.remove('capacidad-maxima');
        }
    } else {
        if (contadorCapacidadElem) contadorCapacidadElem.style.display = 'none';
        if (alertaElem) alertaElem.style.display = 'none';
    }
}

// Descargar datos como CSV
function descargarDatos() {
    if (historialLocal.length === 0) {
        alert('No hay datos para descargar');
        return;
    }
    
    // Crear CSV
    const headers = ['Fecha', 'Hora', 'Nombre', 'Apellido', 'DNI', 'Edad', 'Sexo', 'Mayor de Edad', 'CUIL', 'Fecha Nacimiento', 'Vencimiento DNI'];
    const rows = historialLocal.map(item => [
        item.fecha || '',
        item.hora || '',
        item.nombre || '',
        item.apellido || '',
        item.dni || '',
        item.edad || '',
        item.sexo || '',
        item.esMayorDeEdad ? 'SI' : 'NO',
        item.cuil || '',
        item.fechaNacimiento || '',
        item.fechaVencimiento || ''
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    // Agregar BOM para UTF-8 en Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const fecha = new Date().toISOString().split('T')[0];
    const link = document.createElement('a');
    link.href = url;
    link.download = `escaneos_dni_${fecha}.csv`;
    link.click();
    
    URL.revokeObjectURL(url);
    console.log('📥 Datos descargados:', historialLocal.length, 'registros');
}

// Actualizar info del caché en el menú
function actualizarInfoCache() {
    const cacheCountElem = document.getElementById('cacheCount');
    const lastSessionElem = document.getElementById('lastSession');
    const capacidadMaximaElem = document.getElementById('capacidadMaxima');
    
    if (cacheCountElem) cacheCountElem.textContent = historialLocal.length;
    
    if (lastSessionElem) {
        const lastSession = localStorage.getItem(SESSION_KEY);
        if (lastSession) {
            const fecha = new Date(lastSession);
            lastSessionElem.textContent = fecha.toLocaleString('es-AR');
        } else {
            lastSessionElem.textContent = 'Primera sesión';
        }
    }
    
    if (capacidadMaximaElem) {
        capacidadMaximaElem.textContent = config.habilitarCapacidad ? config.capacidadMaxima : '∞';
    }
}

// Limpiar caché
function limpiarCache() {
    if (confirm('⚠️ ¿Estás seguro? Se borrarán todos los escaneos guardados.\n\n¿Deseas descargar los datos primero?')) {
        const descargar = confirm('¿Descargar datos antes de borrar?');
        if (descargar) {
            descargarDatos();
        }
        
        historialLocal = [];
        localStorage.removeItem(HISTORIAL_KEY);
        actualizarInfoCache();
        alert('✅ Caché limpiado correctamente');
    }
}

// Elementos del DOM
const video = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const quickScanBtn = document.getElementById('quickScanBtn');
const scanSection = document.getElementById('scanSection');
const resultSection = document.getElementById('resultSection');
const contadorTotal = document.getElementById('contadorTotal');
const contadorMayores = document.getElementById('contadorMayores');
const contadorMenores = document.getElementById('contadorMenores');
const contadorSalidas = document.getElementById('contadorSalidas');
const resetCountersBtn = document.getElementById('resetCountersBtn');
const salidaBtn = document.getElementById('salidaBtn');
const contarMenoresCheck = document.getElementById('contarMenoresCheck');
const autoScanTimer = document.getElementById('autoScanTimer');

// Elementos del modo lector físico
const scanModeIndicator = document.getElementById('scanModeIndicator');
const modeCameraTab = document.getElementById('modeCameraTab');
const modeScannerTab = document.getElementById('modeScannerTab');
const cameraContainer = document.getElementById('cameraContainer');
const scannerModeContainer = document.getElementById('scannerModeContainer');
const barcodeInput = document.getElementById('barcodeInput');
const inputIndicator = document.getElementById('inputIndicator');
const deviceStatus = document.getElementById('deviceStatus');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const cameraInstructions = document.getElementById('cameraInstructions');

// ===========================================
// DETECCIÓN DE TIPO DE DISPOSITIVO
// ===========================================
function detectarTipoDispositivo() {
    const userAgent = navigator.userAgent.toLowerCase();
    
    // Detectar colectores comunes (Zebra, Honeywell, Motorola, Datalogic, etc.)
    const colectores = [
        'zebra', 'honeywell', 'motorola', 'symbol', 'datalogic', 
        'intermec', 'opticon', 'cipher', 'unitech', 'm3mobile',
        'android.*scanner', 'android.*barcode', 'android.*pda'
    ];
    
    esColector = colectores.some(c => userAgent.includes(c) || 
        (c.includes('.*') && new RegExp(c).test(userAgent)));
    
    // También detectar si NO hay cámara disponible
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        esColector = true;
    }
    
    // Verificar si es un dispositivo móvil con características de colector
    const esMovil = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    const tienePantallaPequena = window.screen.width < 600;
    
    console.log('📱 Detección de dispositivo:');
    console.log('   User Agent:', userAgent);
    console.log('   Es colector detectado:', esColector);
    console.log('   Es móvil:', esMovil);
    console.log('   Pantalla pequeña:', tienePantallaPequena);
    
    return {
        esColector,
        esMovil,
        tienePantallaPequena,
        tieneCamera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    };
}

// ===========================================
// CAMBIO DE MODO DE ESCANEO
// ===========================================
function cambiarModo(modo) {
    modoActual = modo;
    config.modoEscaneo = modo;
    guardarConfiguracion();
    
    // Actualizar badge de modo
    const modeIcon = document.getElementById('modeIcon');
    const modeText = document.getElementById('modeText');
    const modeBadge = document.getElementById('modeBadge');
    
    // Actualizar radios en el menú
    const configModoCamera = document.getElementById('configModoCamera');
    const configModoScanner = document.getElementById('configModoScanner');
    
    if (modo === 'camera') {
        if (modeIcon) modeIcon.textContent = '📷';
        if (modeText) modeText.textContent = 'Cámara';
        if (modeBadge) modeBadge.className = 'mode-badge mode-camera';
        if (configModoCamera) configModoCamera.checked = true;
        
        // Modo cámara
        if (cameraContainer) cameraContainer.style.display = 'block';
        if (scannerModeContainer) scannerModeContainer.style.display = 'none';
        if (startBtn) startBtn.style.display = 'inline-flex';
        if (cameraInstructions) cameraInstructions.style.display = 'block';
        
        // Desactivar captura de teclado global
        document.removeEventListener('keypress', capturarEntradaGlobal);
        
        actualizarEstadoDispositivo('camera', 'Modo cámara activo');
        
    } else if (modo === 'scanner') {
        if (modeIcon) modeIcon.textContent = '🔫';
        if (modeText) modeText.textContent = 'Lector';
        if (modeBadge) modeBadge.className = 'mode-badge mode-scanner';
        if (configModoScanner) configModoScanner.checked = true;
        
        // Modo lector físico
        stopScanner(); // Detener cámara si está activa
        
        if (cameraContainer) cameraContainer.style.display = 'none';
        if (scannerModeContainer) scannerModeContainer.style.display = 'flex';
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'none';
        if (cameraInstructions) cameraInstructions.style.display = 'none';
        
        // Activar captura de teclado global para detectar pistola
        document.addEventListener('keypress', capturarEntradaGlobal);
        
        // Enfocar el input para colectores que lo necesiten
        if (barcodeInput) {
            barcodeInput.value = '';
            barcodeInput.focus();
        }
        
        actualizarEstadoDispositivo('scanner', 'Listo', 'ready');
    }
    
    console.log(`🔄 Modo cambiado a: ${modo}`);
}

// Actualizar indicador de estado del dispositivo
function actualizarEstadoDispositivo(tipo, mensaje, estado = 'ready') {
    if (statusText) statusText.textContent = mensaje;
    if (statusDot) {
        statusDot.className = 'status-dot';
        if (estado === 'ready') statusDot.classList.add('ready');
        else if (estado === 'active') statusDot.classList.add('active');
        else if (estado === 'success') statusDot.classList.add('success');
        else if (estado === 'error') statusDot.classList.add('error');
    }
}

// ===========================================
// CAPTURA DE ENTRADA DE LECTOR FÍSICO
// ===========================================
function capturarEntradaGlobal(e) {
    // Ignorar si estamos en un input normal (excepto el de código de barras)
    if (e.target.tagName === 'INPUT' && e.target.id !== 'barcodeInput') {
        return;
    }
    
    // Prevenir comportamiento por defecto si estamos en modo scanner
    if (modoActual === 'scanner' && e.target.id !== 'barcodeInput') {
        e.preventDefault();
    }
    
    // Limpiar timeout anterior
    if (barcodeTimeout) {
        clearTimeout(barcodeTimeout);
    }
    
    // Agregar carácter al buffer
    if (e.key === 'Enter') {
        // Enter = fin del código de barras
        procesarBufferBarcode();
    } else if (e.key.length === 1) {
        // Solo caracteres individuales (no teclas especiales)
        barcodeBuffer += e.key;
        
        // Mostrar indicador de que se está recibiendo datos
        actualizarEstadoDispositivo('scanner', `Recibiendo código: ${barcodeBuffer.length} caracteres...`, 'active');
        if (inputIndicator) inputIndicator.textContent = '📥 Recibiendo datos...';
        
        // Actualizar input visible
        if (barcodeInput) barcodeInput.value = barcodeBuffer;
    }
    
    // Timeout para procesar si no llega más datos
    barcodeTimeout = setTimeout(() => {
        if (barcodeBuffer.length >= MIN_BARCODE_LENGTH) {
            procesarBufferBarcode();
        } else if (barcodeBuffer.length > 0) {
            console.log('⚠️ Código muy corto, ignorando:', barcodeBuffer);
            limpiarBufferBarcode();
        }
    }, BARCODE_TIMEOUT * 3);
}

function procesarBufferBarcode() {
    if (barcodeBuffer.length >= MIN_BARCODE_LENGTH) {
        console.log('🔫 Código de barras detectado desde lector físico!');
        console.log('   Longitud:', barcodeBuffer.length);
        console.log('   Código:', barcodeBuffer);
        
        actualizarEstadoDispositivo('scanner', '✅ Código detectado! Procesando...', 'success');
        if (inputIndicator) inputIndicator.textContent = '✅ Código capturado!';
        
        // Procesar el código
        const codigo = barcodeBuffer;
        limpiarBufferBarcode();
        procesarCodigo(codigo);
    }
}

function limpiarBufferBarcode() {
    barcodeBuffer = '';
    if (barcodeTimeout) {
        clearTimeout(barcodeTimeout);
        barcodeTimeout = null;
    }
    if (barcodeInput) barcodeInput.value = '';
    if (inputIndicator) inputIndicator.textContent = '🔫 Listo';
    actualizarEstadoDispositivo('scanner', 'Listo', 'ready');
}

// Inicializar el lector de códigos
function initScanner() {
    codeReader = new ZXing.BrowserPDF417Reader();
    console.log('Scanner inicializado');
}

// Iniciar escáner
async function startScanner() {
    try {
        scanning = true;
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-flex';

        // Solicitar acceso a la cámara
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        video.srcObject = stream;

        // Esperar a que el video esté listo
        await new Promise((resolve) => {
            video.onloadedmetadata = resolve;
        });

        console.log('✅ Cámara iniciada correctamente');
        
        // Comenzar el escaneo continuo
        scanContinuously();

    } catch (error) {
        console.error('❌ Error al acceder a la cámara:', error);
        alert('No se pudo acceder a la cámara. Por favor, verifica los permisos.');
        stopScanner();
    }
}

// Escaneo continuo
async function scanContinuously() {
    if (!scanning) return;

    try {
        const result = await codeReader.decodeFromVideoElement(video);
        
        if (result && result.text) {
            const code = result.text;
            
            // Evitar escaneos duplicados en rápida sucesión
            if (code !== lastScannedCode) {
                lastScannedCode = code;
                console.log('🔍 Código detectado:', code);
                
                // Pausar escaneo y procesar
                scanning = false;
                await procesarCodigo(code);
                
                // Resetear el último código después de 3 segundos
                setTimeout(() => {
                    lastScannedCode = null;
                }, 3000);
            }
        }
    } catch (error) {
        // Ignorar errores de "no se encontró código" ya que es normal durante el escaneo
        if (!error.message.includes('NotFoundException')) {
            console.error('Error en escaneo:', error);
        }
    }

    // Continuar escaneando si sigue activo
    if (scanning) {
        requestAnimationFrame(scanContinuously);
    }
}

// Procesar código escaneado
async function procesarCodigo(codigo) {
    try {
        console.log('📤 Enviando código al servidor...');
        
        // Verificar si se deben contar los menores
        const contarMenores = contarMenoresCheck ? contarMenoresCheck.checked : true;
        
        const response = await fetch('/procesar-dni', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                codigoBarras: codigo,
                contarMenores: contarMenores
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log('✅ Datos procesados correctamente');
            mostrarResultado(data);
        } else {
            console.error('❌ Error al procesar:', data.error);
            alert('Error: ' + data.error);
            scanning = true;
            scanContinuously();
        }

    } catch (error) {
        console.error('❌ Error en la comunicación:', error);
        alert('Error al comunicarse con el servidor');
        scanning = true;
        scanContinuously();
    }
}

// Mostrar resultado
function mostrarResultado(data) {
    const { datos } = data;

    // Detener la cámara para liberar recursos
    stopScanner();

    // Verificar si el DNI ya está adentro (localStorage local)
    if (datos.esMayorDeEdad && dnisAdentroLocal.has(datos.dni)) {
        mostrarAlertaDuplicado(datos);
        return;
    }

    // Actualizar contadores LOCALES
    contadoresLocales.total++;
    
    if (datos.esMayorDeEdad) {
        contadoresLocales.mayores++;
        dnisAdentroLocal.add(datos.dni);
    } else {
        contadoresLocales.menores++;
    }
    
    // Guardar contadores en localStorage
    guardarContadores();
    
    // Actualizar UI
    actualizarContadoresUI();

    // Llenar datos personales
    document.getElementById('nombreCompleto').textContent = datos.nombreCompleto;
    document.getElementById('dniNumero').textContent = datos.dni;
    document.getElementById('cuil').textContent = datos.cuil || 'No disponible';
    document.getElementById('sexo').textContent = datos.sexo === 'M' ? 'Masculino' : datos.sexo === 'F' ? 'Femenino' : datos.sexo;
    document.getElementById('fechaNacimiento').textContent = datos.fechaNacimiento;
    document.getElementById('edadPersona').textContent = `${datos.edad} años`;
    document.getElementById('nacionalidad').textContent = datos.nacionalidad || 'No disponible';
    document.getElementById('lugarNacimiento').textContent = datos.lugarNacimiento || 'No disponible';
    
    // País de nacimiento (solo mostrar si existe y es diferente)
    const paisRow = document.getElementById('paisRow');
    const paisNacimiento = document.getElementById('paisNacimiento');
    if (datos.paisNacimiento && datos.paisNacimiento.trim() !== '') {
        paisNacimiento.textContent = datos.paisNacimiento;
        paisRow.style.display = 'flex';
    } else {
        paisRow.style.display = 'none';
    }

    // Llenar datos del documento
    document.getElementById('tramite').textContent = datos.tramite;
    document.getElementById('ejemplar').textContent = datos.ejemplar;
    document.getElementById('fechaEmision').textContent = datos.fechaEmision;
    document.getElementById('fechaVencimiento').textContent = datos.fechaVencimiento;

    // Badge de estado
    const statusBadge = document.getElementById('statusBadge');
    if (datos.esMayorDeEdad) {
        statusBadge.className = 'status-badge mayor';
        statusBadge.innerHTML = '✅<br>MAYOR DE EDAD<br><span style="font-size: 0.8em;">(+18 años)</span>';
    } else {
        statusBadge.className = 'status-badge menor';
        statusBadge.innerHTML = '⚠️<br>MENOR DE EDAD<br><span style="font-size: 0.8em;">(-18 años)</span>';
    }

    // Mostrar sección de resultados
    scanSection.style.display = 'none';
    resultSection.style.display = 'block';

    // Agregar al historial visual
    agregarAlHistorial(datos);
    
    // 💾 GUARDAR EN LOCALSTORAGE
    agregarAHistorialLocal(datos);

    // Iniciar temporizador automático - RECARGA LA PÁGINA con auto-start
    iniciarTemporizadorAutoScan();
}

// Mostrar alerta cuando el DNI ya está adentro
function mostrarAlertaDuplicado(datos) {
    // Vibrar si es posible (móvil)
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
    }
    
    // Mostrar alerta grande y visible
    alert(`⚠️ YA ESTÁ ADENTRO\n\n${datos.nombreCompleto}\nDNI: ${datos.dni}\n\nEsta persona ya ingresó anteriormente.`);
    
    console.log('⚠️ DNI DUPLICADO:', datos.dni, '-', datos.nombreCompleto);
    
    // Volver a escanear SIN recargar página
    limpiarBufferBarcode();
    
    // Asegurar que el input tenga foco
    if (modoActual === 'scanner' && barcodeInput) {
        setTimeout(() => {
            barcodeInput.value = '';
            barcodeInput.focus();
        }, 100);
    } else if (modoActual === 'camera') {
        scanning = true;
        scanContinuously();
    }
}

// Agregar al historial visual
function agregarAlHistorial(datos) {
    const historialList = document.getElementById('historialList');
    
    // Limpiar mensaje de "sin escaneos"
    const noData = historialList.querySelector('.no-data');
    if (noData) noData.remove();
    
    const item = document.createElement('div');
    item.className = `historial-item ${datos.esMayorDeEdad ? 'mayor' : 'menor'}`;
    item.innerHTML = `
        <div class="historial-info">
            <strong>${datos.nombreCompleto}</strong>
            <span>DNI: ${datos.dni} • ${datos.edad} años</span>
        </div>
        <div class="historial-badge">
            ${datos.esMayorDeEdad ? '✓ +18' : '⚠ -18'}
        </div>
    `;
    
    historialList.insertBefore(item, historialList.firstChild);
    
    // Mantener solo los últimos 10
    while (historialList.children.length > 10) {
        historialList.removeChild(historialList.lastChild);
    }
}

// Detener escáner
function stopScanner() {
    scanning = false;
    
    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }

    // Solo mostrar botón iniciar si estamos en modo cámara
    if (modoActual === 'camera') {
        startBtn.style.display = 'inline-flex';
    }
    stopBtn.style.display = 'none';
}

// Temporizador automático - RECARGA la página con parámetro para auto-iniciar
function iniciarTemporizadorAutoScan() {
    let segundosRestantes = 3; // 3 segundos para ver el resultado
    
    // Limpiar temporizador anterior si existe
    if (autoScanTimeout) {
        clearInterval(autoScanTimeout);
    }
    
    // Actualizar display inicial
    if (autoScanTimer) {
        autoScanTimer.textContent = segundosRestantes;
        autoScanTimer.parentElement.style.display = 'flex';
    }
    
    // Countdown
    autoScanTimeout = setInterval(() => {
        segundosRestantes--;
        
        if (autoScanTimer) {
            autoScanTimer.textContent = segundosRestantes;
        }
        
        if (segundosRestantes <= 0) {
            clearInterval(autoScanTimeout);
            // RECARGAR PÁGINA manteniendo el modo actual
            if (modoActual === 'scanner') {
                window.location.href = '/?modo=scanner';
            } else {
                window.location.href = '/?autostart=1';
            }
        }
    }, 1000);
}

// Cancelar temporizador automático
function cancelarAutoScan() {
    if (autoScanTimeout) {
        clearInterval(autoScanTimeout);
        autoScanTimeout = null;
    }
    if (autoScanTimer && autoScanTimer.parentElement) {
        autoScanTimer.parentElement.style.display = 'none';
    }
}

// Escaneo rápido - RECARGA INMEDIATA (respetando modo)
function escaneoRapido() {
    cancelarAutoScan();
    if (modoActual === 'scanner') {
        window.location.href = '/?modo=scanner';
    } else {
        window.location.href = '/?autostart=1';
    }
}

// Nuevo escaneo - RECARGA INMEDIATA (respetando modo)
function nuevoEscaneo() {
    cancelarAutoScan();
    if (modoActual === 'scanner') {
        window.location.href = '/?modo=scanner';
    } else {
        window.location.href = '/?autostart=1';
    }
}

// Event Listeners
startBtn.addEventListener('click', startScanner);
stopBtn.addEventListener('click', stopScanner);
if (quickScanBtn) {
    quickScanBtn.addEventListener('click', escaneoRapido);
}

// Reiniciar contadores
if (resetCountersBtn) {
    resetCountersBtn.addEventListener('click', async () => {
        if (confirm('🗑️ ¿Reiniciar todos los contadores? Esta acción no se puede deshacer.')) {
            // Reiniciar contadores locales
            contadoresLocales = {
                total: 0,
                mayores: 0,
                menores: 0,
                salidas: 0
            };
            
            // Limpiar DNIs adentro
            dnisAdentroLocal.clear();
            
            // Guardar y actualizar UI
            guardarContadores();
            actualizarContadoresUI();
            
            // Limpiar historial local
            historialLocal = [];
            guardarHistorial();
            
            // Limpiar historial visual
            const historialList = document.getElementById('historialList');
            if (historialList) {
                historialList.innerHTML = '<p class="no-data">Sin escaneos aún</p>';
            }
            
            console.log('🔄 Contadores reiniciados');
        }
    });
}

// Registrar salida
if (salidaBtn) {
    console.log('✅ Botón de salida encontrado, agregando listener');
    salidaBtn.addEventListener('click', async () => {
        console.log('🚪 Click en botón salida detectado');
        
        // Incrementar contador de salidas
        contadoresLocales.salidas++;
        
        // Restar de mayores si es posible
        if (contadoresLocales.mayores > 0) {
            contadoresLocales.mayores--;
        }
        
        // Guardar y actualizar UI
        guardarContadores();
        actualizarContadoresUI();
        
        // Feedback visual rápido
        salidaBtn.style.transform = 'scale(0.95)';
        setTimeout(() => salidaBtn.style.transform = '', 100);
        
        console.log('📊 Contadores actualizados:', contadoresLocales);
    });
} else {
    console.error('❌ Botón de salida NO encontrado');
}

// ===========================================
// MENÚ HAMBURGUESA
// ===========================================
function inicializarMenu() {
    const menuBtn = document.getElementById('menuBtn');
    const menuOverlay = document.getElementById('menuOverlay');
    const menuSidebar = document.getElementById('menuSidebar');
    const menuClose = document.getElementById('menuClose');
    
    // Abrir menú
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            menuSidebar?.classList.add('open');
            menuOverlay?.classList.add('open');
            actualizarInfoCache();
        });
    }
    
    // Cerrar menú
    function cerrarMenu() {
        menuSidebar?.classList.remove('open');
        menuOverlay?.classList.remove('open');
    }
    
    if (menuClose) menuClose.addEventListener('click', cerrarMenu);
    if (menuOverlay) menuOverlay.addEventListener('click', cerrarMenu);
    
    // Cambio de modo desde el menú
    const configModoCamera = document.getElementById('configModoCamera');
    const configModoScanner = document.getElementById('configModoScanner');
    
    if (configModoCamera) {
        configModoCamera.addEventListener('change', () => {
            if (configModoCamera.checked) cambiarModo('camera');
        });
    }
    if (configModoScanner) {
        configModoScanner.addEventListener('change', () => {
            if (configModoScanner.checked) cambiarModo('scanner');
        });
    }
    
    // Habilitar/deshabilitar capacidad
    const habilitarCapacidad = document.getElementById('habilitarCapacidad');
    const capacidadInputWrapper = document.getElementById('capacidadInputWrapper');
    
    if (habilitarCapacidad) {
        habilitarCapacidad.checked = config.habilitarCapacidad;
        if (capacidadInputWrapper) {
            capacidadInputWrapper.style.display = config.habilitarCapacidad ? 'block' : 'none';
        }
        
        habilitarCapacidad.addEventListener('change', () => {
            config.habilitarCapacidad = habilitarCapacidad.checked;
            if (capacidadInputWrapper) {
                capacidadInputWrapper.style.display = habilitarCapacidad.checked ? 'block' : 'none';
            }
            guardarConfiguracion();
            verificarCapacidad();
        });
    }
    
    // Input de capacidad máxima
    const capacidadMaximaInput = document.getElementById('capacidadMaximaInput');
    const guardarCapacidadBtn = document.getElementById('guardarCapacidadBtn');
    
    if (capacidadMaximaInput) {
        capacidadMaximaInput.value = config.capacidadMaxima;
    }
    
    if (guardarCapacidadBtn) {
        guardarCapacidadBtn.addEventListener('click', () => {
            const valor = parseInt(capacidadMaximaInput?.value || '5000');
            if (valor > 0) {
                config.capacidadMaxima = valor;
                guardarConfiguracion();
                verificarCapacidad();
                
                const capacidadMaximaElem = document.getElementById('capacidadMaxima');
                if (capacidadMaximaElem) capacidadMaximaElem.textContent = valor;
                
                alert(`✅ Capacidad máxima establecida en ${valor} personas`);
            }
        });
    }
    
    // Permitir ingreso sin DNI
    const permitirIngresoSinDni = document.getElementById('permitirIngresoSinDni');
    const entradaManualBtn = document.getElementById('entradaManualBtn');
    
    if (permitirIngresoSinDni) {
        permitirIngresoSinDni.checked = config.permitirIngresoSinDni;
        if (entradaManualBtn) {
            entradaManualBtn.style.display = config.permitirIngresoSinDni ? 'inline-flex' : 'none';
        }
        
        permitirIngresoSinDni.addEventListener('change', () => {
            config.permitirIngresoSinDni = permitirIngresoSinDni.checked;
            guardarConfiguracion();
            if (entradaManualBtn) {
                entradaManualBtn.style.display = permitirIngresoSinDni.checked ? 'inline-flex' : 'none';
            }
        });
    }
    
    // Botón de entrada manual
    if (entradaManualBtn) {
        entradaManualBtn.addEventListener('click', registrarEntradaManual);
    }
    
    // Botones de datos
    const descargarDatosBtn = document.getElementById('descargarDatosBtn');
    const descargarAlertaBtn = document.getElementById('descargarAlertaBtn');
    const limpiarCacheBtn = document.getElementById('limpiarCacheBtn');
    const verHistorialBtn = document.getElementById('verHistorialBtn');
    
    if (descargarDatosBtn) descargarDatosBtn.addEventListener('click', descargarDatos);
    if (descargarAlertaBtn) descargarAlertaBtn.addEventListener('click', descargarDatos);
    if (limpiarCacheBtn) limpiarCacheBtn.addEventListener('click', limpiarCache);
    
    if (verHistorialBtn) {
        verHistorialBtn.addEventListener('click', () => {
            if (historialLocal.length === 0) {
                alert('No hay escaneos en el historial');
                return;
            }
            
            let resumen = `📊 HISTORIAL COMPLETO (${historialLocal.length} registros)\n\n`;
            resumen += historialLocal.slice(-20).reverse().map((item, i) => 
                `${i+1}. ${item.nombreCompleto || item.nombre + ' ' + item.apellido} - DNI: ${item.dni} - ${item.edad} años - ${item.fecha} ${item.hora}`
            ).join('\n');
            
            if (historialLocal.length > 20) {
                resumen += `\n\n... y ${historialLocal.length - 20} registros más.\nDescargá el CSV para ver todo.`;
            }
            
            alert(resumen);
        });
    }
}

// Registrar entrada manual (sin DNI)
async function registrarEntradaManual() {
    // Incrementar contadores locales
    contadoresLocales.total++;
    contadoresLocales.mayores++;
    
    // Guardar y actualizar
    guardarContadores();
    actualizarContadoresUI();
    
    // Guardar en historial local
    agregarAHistorialLocal({
        nombreCompleto: 'Entrada Manual',
        nombre: 'Entrada',
        apellido: 'Manual',
        dni: 'SIN DNI',
        edad: '-',
        esMayorDeEdad: true,
        tipo: 'MANUAL'
    });
    
    // Feedback visual
    const entradaManualBtn = document.getElementById('entradaManualBtn');
    if (entradaManualBtn) {
        entradaManualBtn.style.transform = 'scale(0.95)';
        entradaManualBtn.style.background = 'var(--accent-green)';
        setTimeout(() => {
            entradaManualBtn.style.transform = '';
            entradaManualBtn.style.background = '';
        }, 200);
    }
    
    console.log('🟢 Entrada manual registrada');
}

// Inicializar al cargar la página
window.addEventListener('load', () => {
    // Cargar configuración y contadores desde localStorage PRIMERO
    cargarConfiguracion();
    cargarContadores();
    
    // Actualizar UI con los contadores cargados
    actualizarContadoresUI();
    
    initScanner();
    console.log('🚀 Aplicación lista para escanear DNIs');
    
    // Inicializar menú hamburguesa
    inicializarMenu();
    
    // Actualizar info del caché
    actualizarInfoCache();
    
    // Verificar capacidad al cargar
    verificarCapacidad();
    
    // Mostrar/ocultar botón entrada manual según config
    const entradaManualBtn = document.getElementById('entradaManualBtn');
    if (entradaManualBtn) {
        entradaManualBtn.style.display = config.permitirIngresoSinDni ? 'inline-flex' : 'none';
    }
    
    // Detectar tipo de dispositivo
    const infoDispositivo = detectarTipoDispositivo();
    
    // Event listener para el input del código de barras (modo lector físico)
    if (barcodeInput) {
        barcodeInput.addEventListener('input', (e) => {
            // Detectar entrada rápida (característica de lectores)
            barcodeBuffer = e.target.value;
            
            if (barcodeTimeout) clearTimeout(barcodeTimeout);
            
            if (barcodeBuffer.length > 0) {
                actualizarEstadoDispositivo('scanner', `Recibiendo: ${barcodeBuffer.length} caracteres...`, 'active');
                if (inputIndicator) inputIndicator.textContent = '📥 Recibiendo datos...';
            }
            
            barcodeTimeout = setTimeout(() => {
                if (barcodeBuffer.length >= MIN_BARCODE_LENGTH) {
                    procesarBufferBarcode();
                }
            }, BARCODE_TIMEOUT * 2);
        });
        
        barcodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                barcodeBuffer = barcodeInput.value;
                procesarBufferBarcode();
            }
        });
        
        // Mantener foco en el input en modo scanner
        barcodeInput.addEventListener('blur', () => {
            if (modoActual === 'scanner') {
                setTimeout(() => barcodeInput.focus(), 100);
            }
        });
    }
    
    // Determinar modo inicial
    const urlParams = new URLSearchParams(window.location.search);
    const forzarModo = urlParams.get('modo');
    
    // Prioridad: URL > config guardada > detección automática
    if (forzarModo === 'scanner') {
        cambiarModo('scanner');
    } else if (forzarModo === 'camera' || urlParams.get('autostart') === '1') {
        cambiarModo('camera');
        if (urlParams.get('autostart') === '1') {
            setTimeout(() => startScanner(), 300);
        }
    } else if (config.modoEscaneo) {
        // Usar modo guardado en config
        cambiarModo(config.modoEscaneo);
        if (config.modoEscaneo === 'camera' && infoDispositivo.tieneCamera) {
            actualizarEstadoDispositivo('camera', 'Cámara disponible', 'ready');
        }
    } else if (infoDispositivo.esColector) {
        cambiarModo('scanner');
    } else if (infoDispositivo.tieneCamera) {
        cambiarModo('camera');
        actualizarEstadoDispositivo('camera', 'Cámara disponible', 'ready');
    } else {
        cambiarModo('scanner');
    }
});

// Limpiar al cerrar la página
window.addEventListener('beforeunload', () => {
    cancelarAutoScan();
    stopScanner();
});
