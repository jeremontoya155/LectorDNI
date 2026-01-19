let codeReader = null;
let scanning = false;
let lastScannedCode = null;
let scanTimeout = null;
let autoScanTimeout = null;

// Elementos del DOM
const video = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const newScanBtn = document.getElementById('newScanBtn');
const quickScanBtn = document.getElementById('quickScanBtn');
const scanSection = document.getElementById('scanSection');
const resultSection = document.getElementById('resultSection');
const contadorTotal = document.getElementById('contadorTotal');
const autoScanTimer = document.getElementById('autoScanTimer');

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
        
        const response = await fetch('/procesar-dni', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ codigoBarras: codigo })
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
    const { datos, contador } = data;

    // No detener la cámara aquí para evitar que algunos dispositivos tarden en
    // reabrir el stream (provocando pantalla negra). Mantener el stream abierto
    // y simplemente pausar el escaneo. Si no hay stream activo, no pasa nada.
    scanning = false;

    // Actualizar contador
    contadorTotal.textContent = contador;

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

    // Iniciar temporizador automático para el siguiente escaneo (8 segundos)
    iniciarTemporizadorAutoScan();
}

// Reanudar escaneo reutilizando el stream si ya está abierto
function resumeScan() {
    cancelarAutoScan();
    resultSection.style.display = 'none';
    scanSection.style.display = 'block';

    // Verificar si el stream sigue activo y funcionando
    if (video.srcObject && video.srcObject.active) {
        // Stream activo - simplemente reanudar el escaneo
        console.log('✅ Reutilizando stream existente - reinicio instantáneo');
        scanning = true;
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-flex';
        
        // Asegurar que el video esté reproduciendo
        if (video.paused) {
            video.play().catch(err => {
                console.warn('Error al reanudar video:', err);
            });
        }
        
        // Reiniciar el loop de escaneo inmediatamente
        scanContinuously();
    } else {
        // No hay stream activo - iniciar proceso normal
        console.log('⚠️ No hay stream activo, iniciando cámara...');
        startScanner();
    }
}

// Agregar al historial visual
function agregarAlHistorial(datos) {
    const historialList = document.getElementById('historialList');
    
    const item = document.createElement('div');
    item.className = `historial-item ${datos.esMayorDeEdad ? 'mayor' : 'menor'}`;
    item.innerHTML = `
        <div class="historial-info">
            <strong>${datos.nombreCompleto}</strong>
            <span>DNI: ${datos.dni} | Edad: ${datos.edad} años</span>
        </div>
        <div class="historial-badge">
            ${datos.esMayorDeEdad ? '✅ +18' : '⚠️ -18'}
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

// Temporizador automático para siguiente escaneo
function iniciarTemporizadorAutoScan() {
    let segundosRestantes = 4; // Reducido a 4 segundos para mayor fluidez
    
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
            escaneoRapido();
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

// Escaneo rápido (sin detener/iniciar cámara completamente)
function escaneoRapido() {
    cancelarAutoScan();
    resultSection.style.display = 'none';
    scanSection.style.display = 'block';
    resumeScan();
}

// Nuevo escaneo
function nuevoEscaneo() {
    cancelarAutoScan();
    resultSection.style.display = 'none';
    scanSection.style.display = 'block';
    resumeScan();
}

// Event Listeners
startBtn.addEventListener('click', startScanner);
stopBtn.addEventListener('click', stopScanner);
newScanBtn.addEventListener('click', nuevoEscaneo);
if (quickScanBtn) {
    quickScanBtn.addEventListener('click', escaneoRapido);
}

// Inicializar al cargar la página
window.addEventListener('load', () => {
    initScanner();
    console.log('🚀 Aplicación lista para escanear DNIs');
});

// Limpiar al cerrar la página
window.addEventListener('beforeunload', () => {
    cancelarAutoScan();
    stopScanner();
});
