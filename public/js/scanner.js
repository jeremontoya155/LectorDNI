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
    
    // Actualizar tabs
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-mode="${modo}"]`)?.classList.add('active');
    
    if (modo === 'camera') {
        // Modo cámara
        if (cameraContainer) cameraContainer.style.display = 'block';
        if (scannerModeContainer) scannerModeContainer.style.display = 'none';
        if (startBtn) startBtn.style.display = 'inline-flex';
        if (cameraInstructions) cameraInstructions.style.display = 'block';
        
        // Desactivar captura de teclado global
        document.removeEventListener('keypress', capturarEntradaGlobal);
        
        actualizarEstadoDispositivo('camera', 'Modo cámara activo');
        
    } else if (modo === 'scanner') {
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
        
        actualizarEstadoDispositivo('scanner', 'Esperando escaneo del lector...');
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
    if (inputIndicator) inputIndicator.textContent = '⌨️ Esperando entrada...';
    actualizarEstadoDispositivo('scanner', 'Esperando escaneo del lector...', 'ready');
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
    const { datos, contador, contadorMayores: mayores, contadorMenores: menores, contadorSalidas: salidas } = data;

    // Detener la cámara para liberar recursos
    stopScanner();

    // Actualizar contadores
    contadorTotal.textContent = contador;
    if (contadorMayores) contadorMayores.textContent = mayores;
    if (contadorMenores) contadorMenores.textContent = menores;
    if (contadorSalidas) contadorSalidas.textContent = salidas;

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

    // Agregar al historial en el frontend
    agregarAlHistorial(datos);

    // Iniciar temporizador automático - RECARGA LA PÁGINA con auto-start
    iniciarTemporizadorAutoScan();
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

    startBtn.style.display = 'inline-flex';
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
        if (confirm('¿Reiniciar todos los contadores?')) {
            try {
                const response = await fetch('/api/reiniciar-contadores', {
                    method: 'POST'
                });
                const data = await response.json();
                if (data.success) {
                    // Actualizar contadores en pantalla
                    contadorTotal.textContent = '0';
                    if (contadorMayores) contadorMayores.textContent = '0';
                    if (contadorMenores) contadorMenores.textContent = '0';
                    if (contadorSalidas) contadorSalidas.textContent = '0';
                    
                    // Limpiar historial visual
                    const historialList = document.getElementById('historialList');
                    historialList.innerHTML = '<p class="no-data">Sin escaneos aún</p>';
                }
            } catch (error) {
                console.error('Error al reiniciar contadores:', error);
            }
        }
    });
}

// Registrar salida
if (salidaBtn) {
    salidaBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/registrar-salida', {
                method: 'POST'
            });
            const data = await response.json();
            if (data.success) {
                if (contadorSalidas) contadorSalidas.textContent = data.contadorSalidas;
                if (contadorMayores) contadorMayores.textContent = data.contadorMayores;
                // Feedback visual rápido
                salidaBtn.style.transform = 'scale(0.95)';
                setTimeout(() => salidaBtn.style.transform = '', 100);
            }
        } catch (error) {
            console.error('Error al registrar salida:', error);
        }
    });
}

// Inicializar al cargar la página
window.addEventListener('load', () => {
    initScanner();
    console.log('🚀 Aplicación lista para escanear DNIs');
    
    // Detectar tipo de dispositivo
    const infoDispositivo = detectarTipoDispositivo();
    
    // Configurar event listeners para tabs de modo
    if (modeCameraTab) {
        modeCameraTab.addEventListener('click', () => cambiarModo('camera'));
    }
    if (modeScannerTab) {
        modeScannerTab.addEventListener('click', () => cambiarModo('scanner'));
    }
    
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
    
    // Si es colector, activar modo lector físico automáticamente
    const urlParams = new URLSearchParams(window.location.search);
    const forzarModo = urlParams.get('modo'); // ?modo=scanner o ?modo=camera
    
    if (forzarModo === 'scanner' || (infoDispositivo.esColector && forzarModo !== 'camera')) {
        console.log('🔫 Dispositivo colector detectado - Activando modo lector físico');
        cambiarModo('scanner');
    } else if (forzarModo === 'camera' || urlParams.get('autostart') === '1') {
        console.log('📷 Modo cámara seleccionado');
        cambiarModo('camera');
        if (urlParams.get('autostart') === '1') {
            setTimeout(() => startScanner(), 300);
        }
    } else {
        // Por defecto: si tiene cámara, usar cámara; si no, usar lector
        if (infoDispositivo.tieneCamera) {
            cambiarModo('camera');
            actualizarEstadoDispositivo('camera', 'Cámara disponible', 'ready');
        } else {
            cambiarModo('scanner');
        }
    }
});

// Limpiar al cerrar la página
window.addEventListener('beforeunload', () => {
    cancelarAutoScan();
    stopScanner();
});
