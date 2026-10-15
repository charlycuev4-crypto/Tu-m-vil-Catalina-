const SUPABASE_URL = 'https://hinqiuvbwygqhbabvxrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpbnFpdXZid3lncWhiYWJ2eHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODIyMzIsImV4cCI6MjA5NTA1ODIzMn0.wdnO33BVRtJ9-va3iqiAdWCttkAzpL5K1-b4vtyDvJA';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let NOMBRE_CHOFER = localStorage.getItem('cfg_auto_chofer') || "";
let FOTO_CHOFER = localStorage.getItem('cfg_auto_foto') || "https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg";
let AUTO_CHOFER = (localStorage.getItem('cfg_auto_modelo') || "") + " - " + (localStorage.getItem('cfg_auto_color') || "") + " (Patente: " + (localStorage.getItem('cfg_auto_patente') || "") + ")";

let totalDia = parseFloat(localStorage.getItem('chofer_total_dia') || '0');
let ultimoViajeMonto = parseFloat(localStorage.getItem('chofer_ultimo_monto') || '0');
let cantViajesCount = parseInt(localStorage.getItem('chofer_cant_viajes') || '0');

function verificarReseteoDiario() {
    const hoy = new Date().toLocaleDateString();
    const ultimaFecha = localStorage.getItem('chofer_fecha_actual');

    if (ultimaFecha !== hoy) {
        totalDia = 0;
        cantViajesCount = 0;
        localStorage.setItem('chofer_total_dia', '0');
        localStorage.setItem('chofer_cant_viajes', '0');
        localStorage.setItem('chofer_fecha_actual', hoy);
    }
}

function actualizarUIEstadisticas() {
    document.getElementById('lblTotalDia').textContent = '$' + totalDia.toLocaleString('es-AR');
    document.getElementById('lblUltimoViaje').textContent = '$' + ultimoViajeMonto.toLocaleString('es-AR');
    document.getElementById('lblCantViajes').textContent = cantViajesCount;
}

let canalSupabase = null;
let canalChatSupabase = null;
let estaConectado = true; 
let wakeLock = null; 
let idRastreadorGps = null; 
let autocentrarMapa = true;  

let audioCtx = null;
let intervaloCampana = null;
let base64FotoTemp = "";
let silentAudioInterval = null;

function mantenerActivoSegundoPlano() {
    if (silentAudioInterval) return;
    silentAudioInterval = setInterval(() => {
        if (!estaConectado) return;
        forzarHabilitacionAudio();
        if (audioCtx) {
            try {
                let osc = audioCtx.createOscillator();
                let gain = audioCtx.createGain();
                gain.gain.setValueAtTime(0.00001, audioCtx.currentTime);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.1);
            } catch(e){}
        }
        buscarViajesPendientesRecientes();
    }, 15000);
}

function verificarRegistroChofer() {
    if (!localStorage.getItem('cfg_auto_chofer') || !localStorage.getItem('cfg_auto_patente')) {
        document.getElementById('modalConfigChofer').classList.remove('hidden');
    } else {
        document.getElementById('inpNombre').value = localStorage.getItem('cfg_auto_chofer') || '';
        document.getElementById('inpTelefono').value = localStorage.getItem('cfg_auto_telefono') || '';
        document.getElementById('inpModelo').value = localStorage.getItem('cfg_auto_modelo') || '';
        document.getElementById('inpColor').value = localStorage.getItem('cfg_auto_color') || '';
        document.getElementById('inpPatente').value = localStorage.getItem('cfg_auto_patente') || '';
        if(localStorage.getItem('cfg_auto_foto')) {
            document.getElementById('imgPreview').src = localStorage.getItem('cfg_auto_foto');
            base64FotoTemp = localStorage.getItem('cfg_auto_foto');
        }
    }
}

function procesarYComprimirFoto(event) {
    const archivo = event.target.files[0];
    if (!archivo) return;

    if (!archivo.type.startsWith('image/')) {
        alert('Por favor selecciona un archivo de imagen válido.');
        return;
    }

    const lector = new FileReader();
    lector.onload = function(e) {
        const img = new Image();
        img.src = e.target.result;
        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                canvas.width = 300;
                canvas.height = 300;

                let sourceSize = Math.min(img.width, img.height);
                let sourceX = (img.width - sourceSize) / 2;
                let sourceY = (img.height - sourceSize) / 2;

                ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 300, 300);

                base64FotoTemp = canvas.toDataURL('image/jpeg', 0.8);
                document.getElementById('imgPreview').src = base64FotoTemp;
            } catch (err) {
                console.error("Error procesando foto:", err);
                alert("La foto es demasiado grande. Intenta tomar otra.");
            }
        }
    }
    lector.readAsDataURL(archivo);
}

async function guardarConfigChofer(e) {
    e.preventDefault();
    const nombre = document.getElementById('inpNombre').value.trim();
    const telefono = document.getElementById('inpTelefono').value.trim();
    const modelo = document.getElementById('inpModelo').value.trim();
    const color = document.getElementById('inpColor').value.trim();
    const patente = document.getElementById('inpPatente').value.trim();
    const fotoFinal = base64FotoTemp || "https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg";

    localStorage.setItem('cfg_auto_chofer', nombre);
    localStorage.setItem('cfg_auto_telefono', telefono);
    localStorage.setItem('cfg_auto_modelo', modelo);
    localStorage.setItem('cfg_auto_color', color);
    localStorage.setItem('cfg_auto_patente', patente);
    localStorage.setItem('cfg_auto_foto', fotoFinal);

    try {
        await supabaseClient
            .from('conductores')
            .upsert({
                nombre: nombre,
                telefono: telefono,
                modelo: `${modelo} - ${color}`,
                patente: patente,
                foto: fotoFinal,
                aprobado: false,
                lat: choferCoords ? choferCoords.lat : null,
                lng: choferCoords ? choferCoords.lng : null
            }, { onConflict: 'patente' });
            
        alert("¡Registro exitoso! Tu cuenta ha sido enviada al Administrador para su aprobación. Podrás operar una vez que sea aprobada.");
    } catch (err) {
        console.error("Error al sincronizar con la tabla conductores:", err);
    }

    document.getElementById('modalConfigChofer').classList.add('hidden');
    location.reload();
}

function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

async function obtenerDireccionYBarrio(lat, lon) {
    try {
        let res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'es' }
        });
        let data = await res.json();
        if (data && data.address) {
            let calle = data.address.road || data.address.pedestrian || data.address.suburb || "Calle sin nombre";
            let numero = data.address.house_number ? ` ${data.address.house_number}` : "";
            let barrio = data.address.neighbourhood || data.address.suburb || data.address.city_district || data.address.town || data.address.city || "Zona general";
            return {
                calleCompleta: `${calle}${numero}`.trim(),
                barrio: barrio
            };
        }
    } catch (e) {}
    return { calleCompleta: "Punto exacto", barrio: "Zona general" };
}

async function solicitarWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { if (!wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
}
function liberarWakeLock() { if (wakeLock) { wakeLock.release(); wakeLock = null; } }

async function pedirPermisoNotificaciones() {
    if ('Notification' in window) {
        let permiso = Notification.permission;
        if (permiso === 'default') {
            permiso = await Notification.requestPermission();
        }
        return permiso === 'granted';
    }
    return false;
}

function forzarHabilitacionAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    else if (audioCtx.state === 'suspended') audioCtx.resume();
}

function tocarUnRepiqueDeCampana() {
    if (!audioCtx) return;
    try {
        let osc = audioCtx.createOscillator();
        let gainNode = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(1475, audioCtx.currentTime); 
        gainNode.gain.setValueAtTime(0.9, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
        osc.connect(gainNode); gainNode.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.8);
    } catch(e) {}
}

function saludarConductorBienvenida(nombrePasajero) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        
        const texto = nombrePasajero 
            ? `Hola ${nombrePasajero}, bienvenido a Tu Móvil. En camino hacia tu destino.` 
            : `Hola, bienvenido a Tu Móvil. En camino hacia tu destino.`;

        const enunciado = new SpeechSynthesisUtterance(texto);
        enunciado.lang = 'es-AR';
        enunciado.rate = 0.95; 
        enunciado.pitch = 1.0;  

        const voces = window.speechSynthesis.getVoices();
        const vozElegida = voces.find(v => 
            v.lang.includes('es') && (
                v.name.toLowerCase().includes('google') || 
                v.name.toLowerCase().includes('es-')
            )
        ) || voces.find(v => v.lang.startsWith('es'));

        if (vozElegida) {
            enunciado.voice = vozElegida;
        }

        window.speechSynthesis.speak(enunciado);
    }
}

if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
}

function comenzarSirenaAlerta() {
    if (intervaloCampana) return;
    forzarHabilitacionAudio();
    intervaloCampana = setInterval(() => { tocarUnRepiqueDeCampana(); }, 500);
}
function detenerSirenaAlerta() {
    if (intervaloCampana) { clearInterval(intervaloCampana); intervaloCampana = null; }
}

function probarCampanaManual(e) {
    e.stopPropagation();
    forzarHabilitacionAudio();
    tocarUnRepiqueDeCampana();
    const btn = document.getElementById('btnTestSonido');
    btn.textContent = "🔔 ¡Sonando Ok!";
    btn.style.background = "#15803d";
    setTimeout(() => { btn.textContent = "🔊 Probar Timbre"; btn.style.background = "#c2410c"; }, 2000);
}

const ESTACION_SAN_MIGUEL = [-34.54291, -58.71212];
let mapa = null, markerChofer = null, markerOrigen = null, markerDestino = null, rutaTrazada = null;
let choferCoords = { lat: -34.545, lng: -58.715 }; 
let viajeActivo = null;
let estadoFlujo = 'pendiente'; 

function initMapa() {
    mapa = L.map('mapaLeaflet', { zoomControl: false, attributionControl: false }).setView(ESTACION_SAN_MIGUEL, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
    
    const iconoAuto = L.divIcon({ className: 'chofer-auto-icon', html: '🚗', iconSize: [38, 38], iconAnchor: [19, 19] });
    markerChofer = L.marker([choferCoords.lat, choferCoords.lng], { icon: iconoAuto }).addTo(mapa);

    mapa.on('dragstart', () => {
        autocentrarMapa = false;
        document.getElementById('btnGpsCentro').classList.remove('seguimiento-on');
    });
}

function iniciarRastreoGpsContinuo() {
    if (idRastreadorGps) return;
    if (navigator.geolocation) {
        idRastreadorGps = navigator.geolocation.watchPosition(async (pos) => {
            const nuevaLat = pos.coords.latitude;
            const nuevaLng = pos.coords.longitude;
            choferCoords = { lat: nuevaLat, lng: nuevaLng };
            
            if (marker
