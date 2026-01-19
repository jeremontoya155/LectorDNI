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
const contadorMayores = document.getElementById('contadorMayores');
const contadorMenores = document.getElementById('contadorMenores');
const contadorSalidas = document.getElementById('contadorSalidas');
const resetCountersBtn = document.getElementById('resetCountersBtn');
const salidaBtn = document.getElementById('salidaBtn');
const contarMenoresCheck = document.getElementById('contarMenoresCheck');
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
            // RECARGAR PÁGINA con parámetro para auto-iniciar cámara
            window.location.href = '/?autostart=1';
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

// Escaneo rápido - RECARGA INMEDIATA
function escaneoRapido() {
    cancelarAutoScan();
    // Recargar página inmediatamente con auto-start
    window.location.href = '/?autostart=1';
}

// Nuevo escaneo - RECARGA INMEDIATA
function nuevoEscaneo() {
    cancelarAutoScan();
    // Recargar página inmediatamente con auto-start
    window.location.href = '/?autostart=1';
}

// Event Listeners
startBtn.addEventListener('click', startScanner);
stopBtn.addEventListener('click', stopScanner);
newScanBtn.addEventListener('click', nuevoEscaneo);
if (quickScanBtn) {
    quickScanBtn.addEventListener('click', escaneoRapido);
}

// Reiniciar contadores
if (resetCountersBtn) {
    resetCountersBtn.addEventListener('click', async () => {
        if (confirm('¿Estás seguro de reiniciar todos los contadores?')) {
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
                    historialList.innerHTML = '<p class="no-data">No hay escaneos registrados aún</p>';
                    
                    alert('✅ Contadores reiniciados correctamente');
                }
            } catch (error) {
                console.error('Error al reiniciar contadores:', error);
                alert('Error al reiniciar contadores');
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
                console.log('🚪 Salida registrada - Entradas actualizadas');
            }
        } catch (error) {
            console.error('Error al registrar salida:', error);
            alert('Error al registrar salida');
        }
    });
}

// Inicializar al cargar la página
window.addEventListener('load', () => {
    initScanner();
    console.log('🚀 Aplicación lista para escanear DNIs');
    
    // AUTO-INICIAR CÁMARA si viene con el parámetro autostart
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('autostart') === '1') {
        console.log('⚡ Auto-iniciando cámara...');
        // Pequeño delay para asegurar que todo esté listo
        setTimeout(() => {
            startScanner();
        }, 300);
    }
});

// Limpiar al cerrar la página
window.addEventListener('beforeunload', () => {
    cancelarAutoScan();
    stopScanner();
});
