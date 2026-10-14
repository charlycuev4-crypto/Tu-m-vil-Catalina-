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

// ==========================================================
// COMPRESIÓN Y RECORTE EXACTO 300x300 (ANTI-DESBORDAMIENTO MÓVILES NUEVOS)
// ==========================================================
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
                
                // Forzamos tamaño exacto 300x300 píxeles
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

function guardarConfigChofer(e) {
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

// ==========================================================
// MOTOR DE VOZ: LOCUTOR MASCULINO (TONO GRAVE REFORZADO)
// ==========================================================
function saludarConductorBienvenida(nombrePasajero) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        
        const texto = nombrePasajero 
            ? `Hola ${nombrePasajero}, bienvenido a Tu Móvil. En camino hacia tu destino.` 
            : `Hola, bienvenido a Tu Móvil. En camino hacia tu destino.`;

        const enunciado = new SpeechSynthesisUtterance(texto);
        enunciado.lang = 'es-AR';
        enunciado.rate = 0.90; // Velocidad pausada y formal de locutor
        enunciado.pitch = 0.5; // Tono grave garantizado (voz masculina profunda)
        
        // Intentar seleccionar una voz masculina en español si el navegador la soporta
        const voces = window.speechSynthesis.getVoices();
        const vozElegida = voces.find(v => v.lang.includes('es') && (v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('pablo') || v.name.toLowerCase().includes('raul') || v.name.toLowerCase().includes('mateo')));
        if (vozElegida) {
            enunciado.voice = vozElegida;
        }

        window.speechSynthesis.speak(enunciado);
    }
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
            
            if (markerChofer) markerChofer.setLatLng([nuevaLat, nuevaLng]);

            if (autocentrarMapa) {
                let zoomActual = (estadoFlujo !== 'pendiente' && viajeActivo) ? 17 : 15;
                mapa.setView([nuevaLat, nuevaLng], zoomActual);
                document.getElementById('btnGpsCentro').classList.add('seguimiento-on');
            }

            if (viajeActivo && viajeActivo.id) {
                try {
                    await supabaseClient.from('viajes').update({ conductor_lat: nuevaLat, conductor_lng: nuevaLng }).eq('id', viajeActivo.id);
                } catch (err) {}
            }

            if (viajeActivo && (estadoFlujo === 'aceptado' || estadoFlujo === 'en_puerta')) {
                actualizarRutaEnMovimiento(nuevaLat, nuevaLng, viajeActivo.origen_lat, viajeActivo.origen_lng);
            } else if (viajeActivo && estadoFlujo === 'en_viaje') {
                actualizarRutaEnMovimiento(nuevaLat, nuevaLng, viajeActivo.destino_lat, viajeActivo.destino_lng);
            }
        }, (error) => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
    }
}

function detenerRastreoGps() {
    if (idRastreadorGps) { navigator.geolocation.clearWatch(idRastreadorGps); idRastreadorGps = null; }
}

function alternarSeguimientoManual() {
    autocentrarMapa = true;
    document.getElementById('btnGpsCentro').classList.add('seguimiento-on');
    mapa.setView([choferCoords.lat, choferCoords.lng], (estadoFlujo !== 'pendiente' && viajeActivo) ? 17 : 15);
}

function abrirNavegacionGoogleMaps() {
    if (!viajeActivo) { alert("Necesitás un viaje activo."); return; }
    let destLat = (estadoFlujo === 'en_viaje') ? viajeActivo.destino_lat : viajeActivo.origen_lat;
    let destLng = (estadoFlujo === 'en_viaje') ? viajeActivo.destino_lng : viajeActivo.origen_lng;
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${choferCoords.lat},${choferCoords.lng}&destination=${destLat},${destLng}&travelmode=driving`, '_blank');
}

async function buscarViajesPendientesRecientes() {
    if (viajeActivo || !estaConectado) return;
    try {
        const { data: viajes, error } = await supabaseClient
            .from('viajes').select('*').eq('estado', 'pendiente').is('conductor_nombre', null)
            .order('created_at', { ascending: false }).limit(1);

        if (!error && viajes && viajes.length > 0) {
            const viajeReciente = viajes[0];
            const tiempoCreacion = new Date(viajeReciente.created_at).getTime();
            const ahora = Date.now();
            if ((ahora - tiempoCreacion) < 60000) { 
                const distanciaAlViaje = calcularDistanciaKm(choferCoords.lat, choferCoords.lng, viajeReciente.origen_lat, viajeReciente.origen_lng);
                if (distanciaAlViaje <= 5) { montarViajeEntrante(viajeReciente); }
            }
        }
    } catch (err) {}
}

function escucharNuevosViajes() {
    if (canalSupabase) return;
    buscarViajesPendientesRecientes();

    canalSupabase = supabaseClient.channel('despacho-chofer');
    canalSupabase
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'viajes' }, (payload) => {
            if (payload.new.estado === 'pendiente' && !viajeActivo && estaConectado) {
                const distanciaAlViaje = calcularDistanciaKm(choferCoords.lat, choferCoords.lng, payload.new.origen_lat, payload.new.origen_lng);
                if (distanciaAlViaje > 5) return;
                montarViajeEntrante(payload.new);
            }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'viajes' }, (payload) => {
            if (viajeActivo && payload.new.id === viajeActivo.id && payload.new.estado === 'cancelado') {
                detenerSirenaAlerta();
                mostrarMsg('El pasajero canceló el viaje.', 'success');
                limpiarMemoriaConductor();
                setTimeout(() => location.reload(), 3000);
            }
        })
        .subscribe();
}

function toggleChatFlotante() {
    const modal = document.getElementById('modalChatFlotante');
    modal.classList.toggle('activo');

    if (modal.classList.contains('activo')) {
        const btnChat = document.getElementById('btnAbrirChatFlotante');
        if (btnChat) btnChat.classList.remove('chat-alerta-activo');
    }
}

function iniciarChatViaje(viajeId) {
    cargarHistorialMensajes(viajeId);
    if (canalChatSupabase) supabaseClient.removeChannel(canalChatSupabase);

    canalChatSupabase = supabaseClient.channel(`chat_viaje_${viajeId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'mensajes',
            filter: `viaje_id=eq.${viajeId}`
        }, payload => {
            agregarMensajeAlDom(payload.new);

            const modalChat = document.getElementById('modalChatFlotante');
            if (payload.new.emisor !== 'conductor' && !modalChat.classList.contains('activo')) {
                tocarUnRepiqueDeCampana();
                const btnChat = document.getElementById('btnAbrirChatFlotante');
                if (btnChat) btnChat.classList.add('chat-alerta-activo');
            }
        })
        .subscribe();
}

async function cargarHistorialMensajes(viajeId) {
    try {
        const { data, error } = await supabaseClient
            .from('mensajes')
            .select('*')
            .eq('viaje_id', viajeId)
            .order('created_at', { ascending: true });

        const listaHtml = document.getElementById('listaMensajesChat');
        if (!listaHtml) return;
        listaHtml.innerHTML = '';
        if (data && data.length > 0) {
            data.forEach(msg => agregarMensajeAlDom(msg));
        } else {
            listaHtml.innerHTML = '<div style="color: #86efac; text-align: center; font-size: 0.75rem;">No hay mensajes previos. Escribe algo...</div>';
        }
    } catch (e) {}
}

function agregarMensajeAlDom(msg) {
    const listaHtml = document.getElementById('listaMensajesChat');
    if (!listaHtml) return;

    if (listaHtml.innerHTML.includes('No hay mensajes previos')) {
        listaHtml.innerHTML = '';
    }
    const div = document.createElement('div');
    let claseEmisor = 'pasajero';
    if (msg.emisor === 'conductor') claseEmisor = 'conductor';
    if (msg.emisor === 'admin') claseEmisor = 'admin';

    div.className = `chat-msg-item ${claseEmisor}`;
    div.innerHTML = `<span style="font-size:0.65rem; opacity:0.7; display:block;"><b>${msg.emisor}:</b></span> ${msg.mensaje}`;
    listaHtml.appendChild(div);
    listaHtml.scrollTop = listaHtml.scrollHeight;
}

async function enviarMensajeChat() {
    const input = document.getElementById('inpMensajeChat');
    const texto = input.value.trim();
    if (!texto || !viajeActivo) return;

    input.value = '';
    try {
        await supabaseClient.from('mensajes').insert([{
            viaje_id: viajeActivo.id,
            emisor: 'conductor',
            mensaje: texto
        }]);
    } catch (e) {}
}

function conmutarEstadoConexion() {
    if (viajeActivo) return;
    estaConectado = !estaConectado;
    const badge = document.getElementById('txtEstadoChofer');
    const btnEspera = document.getElementById('btnEstadoEsperaTexto');

    if (estaConectado) {
        badge.textContent = "Móvil en Línea 🟢"; badge.className = "status-badge activo";
        btnEspera.innerHTML = `<div class="ruedita-radar"></div>Buscando solicitudes (5 km)...`; 
        btnEspera.className = "btn-action btn-espera";
        solicitarWakeLock(); iniciarRastreoGpsContinuo(); escucharNuevosViajes();
        mantenerActivoSegundoPlano();
        buscarViajesPendientesRecientes();
    } else {
        badge.textContent = "Fuera de Línea 🔴"; badge.className = "status-badge inactivo";
        btnEspera.textContent = "Turno Pausado"; btnEspera.className = "btn-action btn-desconectado";
        liberarWakeLock(); detenerRastreoGps(); 
        if(silentAudioInterval) { clearInterval(silentAudioInterval); silentAudioInterval = null; }
        if(canalSupabase) { supabaseClient.removeChannel(canalSupabase); canalSupabase = null; }
    }
}

async function montarViajeEntrante(viaje) {
    viajeActivo = viaje;
    estadoFlujo = 'pendiente';
    comenzarSirenaAlerta();

    document.getElementById('vistaEspera').classList.add('hidden');
    document.getElementById('vistaViaje').classList.remove('hidden');
    
    const panel = document.getElementById('panelConductor');
    panel.classList.remove('viaje-activo-estado');
    panel.classList.add('viaje-entrante');

    let origenInfo = await obtenerDireccionYBarrio(viaje.origen_lat, viaje.origen_lng);
    let destinoInfo = await obtenerDireccionYBarrio(viaje.destino_lat, viaje.destino_lng);

    let barrioOrigen = viaje.origen_barrio || origenInfo.barrio;
    let calleOrigen = viaje.origen_direccion || origenInfo.calleCompleta;
    let barrioDestino = viaje.destino_barrio || destinoInfo.barrio;
    let calleDestino = viaje.destino_direccion || destinoInfo.calleCompleta;
    
    let textoManifiesto = viaje.manifiesto || viaje.comentarios || viaje.nota || "";
    let manifiestoHtml = '';
    if (textoManifiesto && textoManifiesto.trim() !== "" && textoManifiesto !== "Sin especificaciones adicionales de carga") {
        manifiestoHtml = `<div class="manifesto-box">📋 <b>Manifiesto / Info:</b> ${textoManifiesto}</div>`;
    }

    let avisoFidelidadHtml = '';
    if (viaje.es_fidelidad === true) {
        avisoFidelidadHtml = `
            <div style="background: #143621; border: 2px solid #22c55e; padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                <h4 style="color: #4ade80; margin: 0 0 4px 0; font-size: 0.9rem;">🎁 ¡Viaje Promocional / Cupón Solidario!</h4>
                <p style="color: #86efac; font-size: 0.8rem; margin: 0;">50% de descuento aplicado (Fidelidad).</p>
            </div>
        `;
    }

    const contenedorViaje = document.getElementById('contenedorViajeEntrante');
    contenedorViaje.innerHTML = `
        ${avisoFidelidadHtml}
        <div class="viaje-info-box">
            <div class="viaje-header">
                <div class="pasajero-perfil-container">
                    <div class="pasajero-foto-box">
                        <img id="imgPasajeroFoto" src="${viaje.pasajero_foto || 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg'}" alt="Pasajero">
                    </div>
                    <div>
                        <div class="viaje-pasajero">${viaje.pasajero_nombre || "Pasajero"}</div>
                    </div>
                </div>
                <div class="viaje-precio">$${viaje.precio}</div>
            </div>
            <div class="input-group">
                <div class="input-row">
                    <span>📍 <b>Recogida:</b> ${barrioOrigen} (${calleOrigen})</span>
                    <span style="color:#ef4444; margin-top:2px;">🏁 <b>Destino:</b> ${barrioDestino} (${calleDestino})</span>
                    <div style="border-top:1px solid #166534; margin-top:3px; padding-top:4px; display:flex; justify-content:space-between;" id="cajaMetricasRuta">
                        <span>🕒 Calculando ruta local...</span>
                    </div>
                    ${manifiestoHtml}
                </div>
            </div>
        </div>
        <div id="contenedorBotonesPendiente" style="display: flex; gap: 8px; margin-bottom: 8px;">
            <button class="btn-action" style="background: #ef4444; flex: 1; margin-bottom: 0;" onclick="rechazarViajeEntrante()">Rechazar ❌</button>
            <button class="btn-action btn-aceptar" style="flex: 2; margin-bottom: 0;" id="btnAccionPrincipal" onclick="procesarLojicaViaje()">Aceptar Viaje ✅</button>
        </div>
        <button class="btn-action btn-aceptar hidden" id="btnAccionEnCurso" onclick="procesarLojicaViaje()">Ya llegué a la puerta 🔓</button>
    `;

    if (markerOrigen) mapa.removeLayer(markerOrigen);
    if (markerDestino) mapa.removeLayer(markerDestino);

    markerOrigen = L.marker([viaje.origen_lat, viaje.origen_lng], { icon: L.divIcon({ className: 'pasajero-origen-icon' }) }).addTo(mapa);
    markerDestino = L.marker([viaje.destino_lat, viaje.destino_lng], { icon: L.divIcon({ className: 'pasajero-destino-icon' }) }).addTo(mapa);

    autocentrarMapa = true; 
    await trazarRutaCallesYCalcularMetricas(choferCoords.lat, choferCoords.lng, viaje.origen_lat, viaje.origen_lng, viaje.destino_lat, viaje.destino_lng);
}

function rechazarViajeEntrante() {
    detenerSirenaAlerta();
    limpiarMemoriaConductor();

    if (markerOrigen) { mapa.removeLayer(markerOrigen); markerOrigen = null; }
    if (markerDestino) { mapa.removeLayer(markerDestino); markerDestino = null; }
    if (rutaTrazada) { mapa.removeLayer(rutaTrazada); rutaTrazada = null; }

    viajeActivo = null; estadoFlujo = 'pendiente';
    document.getElementById('vistaViaje').classList.add('hidden');
    document.getElementById('vistaEspera').classList.remove('hidden');
    
    const panel = document.getElementById('panelConductor');
    panel.classList.remove('viaje-entrante');
    panel.classList.remove('viaje-activo-estado');
    
    if(canalChatSupabase) { supabaseClient.removeChannel(canalChatSupabase); canalChatSupabase = null; }
    document.getElementById('btnAbrirChatFlotante').style.display = 'none';

    mostrarMsg('Viaje rechazado. Buscando nuevos pasajeros...', 'success');
}

async function procesarLojicaViaje() {
    const panel = document.getElementById('panelConductor');

    if (estadoFlujo === 'pendiente') {
        detenerSirenaAlerta();
        try {
            const { error } = await supabaseClient.from('viajes').update({ 
                conductor_nombre: NOMBRE_CHOFER, 
                conductor_auto: AUTO_CHOFER,
                conductor_foto: FOTO_CHOFER 
            }).eq('id', viajeActivo.id);
            if (error) throw error;
            
            estadoFlujo = 'aceptado';
            localStorage.setItem('conductor_viaje_id', viajeActivo.id);
            localStorage.setItem('conductor_estado_flujo', 'aceptado');
            
            panel.classList.remove('viaje-entrante');
            panel.classList.add('viaje-activo-estado');
            
            const btnContenedorPendiente = document.getElementById('contenedorBotonesPendiente');
            if(btnContenedorPendiente) btnContenedorPendiente.classList.add('hidden');
            
            const btnEnCurso = document.getElementById('btnAccionEnCurso');
            btnEnCurso.classList.remove('hidden');
            btnEnCurso.className = "btn-action btn-llegué"; 
            btnEnCurso.textContent = "Ya llegué a la puerta 🔓";

            document.getElementById('txtEstadoChofer').textContent = "Yendo al Pasajero 🚗";

            iniciarChatViaje(viajeActivo.id);
            document.getElementById('btnAbrirChatFlotante').style.display = 'flex';

            autocentrarMapa = true;
            document.getElementById('btnGpsCentro').classList.add('seguimiento-on');
            mapa.setView([choferCoords.lat, choferCoords.lng], 17);
        } catch (e) { location.reload(); }
        return;
    }

    const btnEnCurso = document.getElementById('btnAccionEnCurso');
    if (estadoFlujo === 'aceptado') {
        estadoFlujo = 'en_puerta'; localStorage.setItem('conductor_estado_flujo', 'en_puerta');
        btnEnCurso.className = "btn-action btn-iniciar"; btnEnCurso.textContent = "Iniciar Viaje al Destino 🧭";
        document.getElementById('txtEstadoChofer').textContent = "En la Puerta 📍";
        await supabaseClient.from('viajes').update({ estado: 'aceptado' }).eq('id', viajeActivo.id);
        return;
    }
    if (estadoFlujo === 'en_puerta') {
        estadoFlujo = 'en_viaje'; localStorage.setItem('conductor_estado_flujo', 'en_viaje');
        
        // DISPARA EL SALUDO CON TONO GRAVE MASCULINO AL INICIAR EL VIAJE
        saludarConductorBienvenida(viajeActivo.pasajero_nombre);

        btnEnCurso.className = "btn-action btn-finalizar"; 
        btnEnCurso.textContent = "Finalizar Viaje y Cobrar 💵";
        document.getElementById('txtEstadoChofer').textContent = "Viajando al Destino 🧭";
        
        await supabaseClient.from('viajes').update({ estado: 'en_viaje' }).eq('id', viajeActivo.id);
        
        let destinoInfo = await obtenerDireccionYBarrio(viajeActivo.destino_lat, viajeActivo.destino_lng);
        let barrioDestino = viajeActivo.destino_barrio || destinoInfo.barrio;
        let calleDestino = viajeActivo.destino_direccion || destinoInfo.calleCompleta;

        let textoManifiesto = viajeActivo.manifiesto || viajeActivo.comentarios || viajeActivo.nota || "";
        let manifiestoHtml = '';
        if (textoManifiesto && textoManifiesto.trim() !== "" && textoManifiesto !== "Sin especificaciones adicionales de carga") {
            manifiestoHtml = `<div class="manifesto-box">📋 <b>Manifiesto / Info:</b> ${textoManifiesto}</div>`;
        }

        let avisoFidelidadHtml = '';
        if (viajeActivo.es_fidelidad === true) {
            avisoFidelidadHtml = `
                <div style="background: #143621; border: 2px solid #22c55e; padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                    <h4 style="color: #4ade80; margin: 0 0 4px 0; font-size: 0.9rem;">🎁 ¡Viaje Promocional / Cupón Solidario!</h4>
                    <p style="color: #86efac; font-size: 0.8rem; margin: 0;">50% de descuento aplicado (Fidelidad).</p>
                </div>
            `;
        }

        const contenedorViaje = document.getElementById('contenedorViajeEntrante');
        contenedorViaje.innerHTML = `
            ${avisoFidelidadHtml}
            <div class="viaje-info-box">
                <div class="viaje-header">
                    <div class="pasajero-perfil-container">
                        <div class="pasajero-foto-box">
                            <img id="imgPasajeroFoto" src="${viajeActivo.pasajero_foto || 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg'}" alt="Pasajero">
                        </div>
                        <div>
                            <div class="viaje-pasajero">${viajeActivo.pasajero_nombre || "Pasajero"}</div>
                        </div>
                    </div>
                    <div class="viaje-precio">$${viajeActivo.precio}</div>
                </div>
                <div class="input-group">
                    <div class="input-row">
                        <span style="color:#ef4444;">🏁 <b>Destino Final:</b> ${barrioDestino} (${calleDestino})</span>
                        <div style="border-top:1px solid #166534; margin-top:3px; padding-top:3px;" id="cajaMetricasRuta">
                            <span>🕒 Calculando viaje...</span>
                        </div>
                        ${manifiestoHtml}
                    </div>
                </div>
            </div>
            <button class="btn-action btn-finalizar" id="btnAccionEnCurso" onclick="procesarLojicaViaje()">Finalizar Viaje y Cobrar 💵</button>
        `;

        await trazarRutaCallesYCalcularMetricas(viajeActivo.origen_lat, viajeActivo.origen_lng, viajeActivo.destino_lat, viajeActivo.destino_lng, null, null);
        
        autocentrarMapa = true;
        document.getElementById('btnGpsCentro').classList.add('seguimiento-on');
        return;
    }
    if (estadoFlujo === 'en_viaje') {
        let montoViaje = parseFloat(viajeActivo.precio || '0');
        totalDia += montoViaje;
        ultimoViajeMonto = montoViaje;
        cantViajesCount += 1;

        localStorage.setItem('chofer_total_dia', totalDia);
        localStorage.setItem('chofer_ultimo_monto', ultimoViajeMonto);
        localStorage.setItem('chofer_cant_viajes', cantViajesCount);
        actualizarUIEstadisticas();

        await supabaseClient.from('viajes').update({ estado: 'finalizado' }).eq('id', viajeActivo.id);
        limpiarMemoriaConductor(); liberarWakeLock(); detenerRastreoGps();
        if(silentAudioInterval) { clearInterval(silentAudioInterval); silentAudioInterval = null; }
        if(canalChatSupabase) { supabaseClient.removeChannel(canalChatSupabase); }
        setTimeout(() => location.reload(), 2000);
    }
}

async function verificarViajeActivoConductor() {
    const guardadoId = localStorage.getItem('conductor_viaje_id');
    const guardadoEstado = localStorage.getItem('conductor_estado_flujo');
    if (!guardadoId) return;
    try {
        const { data: viaje } = await supabaseClient.from('viajes').select('*').eq('id', guardadoId).single();
        if (!viaje || viaje.estado === 'finalizado' || viaje.estado === 'cancelado') { limpiarMemoriaConductor(); return; }
        viajeActivo = viaje; estadoFlujo = guardadoEstado || 'aceptado';
        
        document.getElementById('vistaEspera').classList.add('hidden');
        document.getElementById('vistaViaje').classList.remove('hidden');

        const panel = document.getElementById('panelConductor');
        panel.classList.remove('viaje-entrante');
        panel.classList.add('viaje-activo-estado');

        iniciarChatViaje(viaje.id);
        document.getElementById('btnAbrirChatFlotante').style.display = 'flex';

        let origenInfo = await obtenerDireccionYBarrio(viaje.origen_lat, viaje.origen_lng);
        let destinoInfo = await obtenerDireccionYBarrio(viaje.destino_lat, viaje.destino_lng);
        let barrioOrigen = viaje.origen_barrio || origenInfo.barrio;
        let calleOrigen = viaje.origen_direccion || origenInfo.calleCompleta;
        let barrioDestino = viaje.destino_barrio || destinoInfo.barrio;
        let calleDestino = viaje.destino_direccion || destinoInfo.calleCompleta;

        let textoManifiesto = viaje.manifiesto || viaje.comentarios || viaje.nota || "";
        let manifiestoHtml = '';
        if (textoManifiesto && textoManifiesto.trim() !== "" && textoManifiesto !== "Sin especificaciones adicionales de carga") {
            manifiestoHtml = `<div class="manifesto-box">📋 <b>Manifiesto / Info:</b> ${textoManifiesto}</div>`;
        }

        let avisoFidelidadHtml = '';
        if (viaje.es_fidelidad === true) {
            avisoFidelidadHtml = `
                <div style="background: #143621; border: 2px solid #22c55e; padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                    <h4 style="color: #4ade80; margin: 0 0 4px 0; font-size: 0.9rem;">🎁 ¡Viaje Promocional / Cupón Solidario!</h4>
                    <p style="color: #86efac; font-size: 0.8rem; margin: 0;">50% de descuento aplicado (Fidelidad).</p>
                </div>
            `;
        }

        markerOrigen = L.marker([viaje.origen_lat, viaje.origen_lng], { icon: L.divIcon({ className: 'pasajero-origen-icon' }) }).addTo(mapa);
        markerDestino = L.marker([viaje.destino_lat, viaje.destino_lng], { icon: L.divIcon({ className: 'pasajero-destino-icon' }) }).addTo(mapa);

        const contenedorViaje = document.getElementById('contenedorViajeEntrante');
        
        if (estadoFlujo === 'aceptado') {
            contenedorViaje.innerHTML = `
                ${avisoFidelidadHtml}
                <div class="viaje-info-box">
                    <div class="viaje-header">
                        <div class="pasajero-perfil-container">
                            <div class="pasajero-foto-box">
                                <img id="imgPasajeroFoto" src="${viaje.pasajero_foto || 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg'}" alt="Pasajero">
                            </div>
                            <div>
                                <div class="viaje-pasajero">${viaje.pasajero_nombre || "Pasajero"}</div>
                            </div>
                        </div>
                        <div class="viaje-precio">$${viaje.precio}</div>
                    </div>
                    <div class="input-group">
                        <div class="input-row">
                            <span>📍 <b>Recogida:</b> ${barrioOrigen} (${calleOrigen})</span>
                            <div style="border-top:1px solid #166534; margin-top:3px; padding-top:4px;" id="cajaMetricasRuta"><span>🕒 Calculando...</span></div>
                            ${manifiestoHtml}
                        </div>
                    </div>
                </div>
                <button class="btn-action btn-llegué" id="btnAccionEnCurso" onclick="procesarLojicaViaje()">Ya llegué a la puerta 🔓</button>
            `;
            await trazarRutaCallesYCalcularMetricas(choferCoords.lat, choferCoords.lng, viaje.origen_lat, viaje.origen_lng, viaje.destino_lat, viaje.destino_lng);
        } else if (estadoFlujo === 'en_puerta') {
            contenedorViaje.innerHTML = `
                ${avisoFidelidadHtml}
                <div class="viaje-info-box">
                    <div class="viaje-header">
                        <div class="pasajero-perfil-container">
                            <div class="pasajero-foto-box">
                                <img id="imgPasajeroFoto" src="${viaje.pasajero_foto || 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg'}" alt="Pasajero">
                            </div>
                            <div>
                                <div class="viaje-pasajero">${viaje.pasajero_nombre || "Pasajero"}</div>
                            </div>
                        </div>
                        <div class="viaje-precio">$${viaje.precio}</div>
                    </div>
                    <div class="input-group">
                        <div class="input-row">
                            <span>📍 <b>En puerta del pasajero</b> (${barrioOrigen})</span>
                            <div style="border-top:1px solid #166534; margin-top:3px; padding-top:4px;" id="cajaMetricasRuta"><span>🕒 Pasajero a bordo</span></div>
                            ${manifiestoHtml}
                        </div>
                    </div>
                </div>
                <button class="btn-action btn-iniciar" id="btnAccionEnCurso" onclick="procesarLojicaViaje()">Iniciar Viaje al Destino 🧭</button>
            `;
            await trazarRutaCallesYCalcularMetricas(choferCoords.lat, choferCoords.lng, viaje.origen_lat, viaje.origen_lng, viaje.destino_lat, viaje.destino_lng);
        } else if (estadoFlujo === 'en_viaje') {
            contenedorViaje.innerHTML = `
                ${avisoFidelidadHtml}
                <div class="viaje-info-box">
                    <div class="viaje-header">
                        <div class="pasajero-perfil-container">
                            <div class="pasajero-foto-box">
                                <img id="imgPasajeroFoto" src="${viaje.pasajero_foto || 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg'}" alt="Pasajero">
                            </div>
                            <div>
                                <div class="viaje-pasajero">${viaje.pasajero_nombre || "Pasajero"}</div>
                            </div>
                        </div>
                        <div class="viaje-precio">$${viaje.precio}</div>
                    </div>
                    <div class="input-group">
                        <div class="input-row">
                            <span style="color:#ef4444;">🏁 <b>Destino Final:</b> ${barrioDestino} (${calleDestino})</span>
                            <div style="border-top:1px solid #166534; margin-top:3px; padding-top:4px;" id="cajaMetricasRuta"><span>🕒 Calculando viaje...</span></div>
                            ${manifiestoHtml}
                        </div>
                    </div>
                </div>
                <button class="btn-action btn-finalizar" id="btnAccionEnCurso" onclick="procesarLojicaViaje()">Finalizar Viaje y Cobrar 💵</button>
            `;
            await trazarRutaCallesYCalcularMetricas(viaje.origen_lat, viaje.origen_lng, viaje.destino_lat, viaje.destino_lng, null, null);
        }
    } catch (e) { limpiarMemoriaConductor(); }
}

function limpiarMemoriaConductor() { localStorage.removeItem('conductor_viaje_id'); localStorage.removeItem('conductor_estado_flujo'); }

async function trazarRutaCallesYCalcularMetricas(lat1, lon1, lat2, lon2, latDestinoExtra = null, lonDestinoExtra = null) {
    try {
        let url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}`;
        if (latDestinoExtra && lonDestinoExtra) {
            url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2};${lonDestinoExtra},${lonDestinoExtra}`;
        }
        url += `?overview=full&geometries=geojson`;

        const res = await fetch(url);
        const data = await res.json();
        
        let distanciaKm = 0;
        let minutosEstimados = 0;
        let rutaValida = false;

        if (data.code === 'Ok' && data.routes.length > 0) {
            let distanciaMetros = data.routes[0].distance;
            let duracionSegundos = data.routes[0].duration;

            distanciaKm = (distanciaMetros / 1000);
            minutosEstimados = Math.max(1, Math.round(duracionSegundos / 60));

            if (distanciaKm < 100) {
                rutaValida = true;
                if (rutaTrazada) mapa.removeLayer(rutaTrazada);
                rutaTrazada = L.polyline(data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]), { color: '#22c55e', weight: 6, opacity: 0.9 }).addTo(mapa);
            }
        }

        if (!rutaValida) {
            let distanciaLineaMetros = calcularDistanciaKm(lat1, lon1, lat2, lon2) * 1000;
            distanciaKm = (distanciaLineaMetros / 1000) * 1.3; 
            minutosEstimados = Math.max(1, Math.round((distanciaKm / 30) * 60));
        }

        let cajaMetricas = document.getElementById('cajaMetricasRuta');
        if (cajaMetricas) {
            if (latDestinoExtra) {
                cajaMetricas.innerHTML = `<span>🕒 <b>${minutosEstimados} min</b> (${distanciaKm.toFixed(1)} km al pasajero)</span>`;
            } else {
                cajaMetricas.innerHTML = `<span>🕒 <b>${minutosEstimados} min</b> de viaje real (${distanciaKm.toFixed(1)} km)</span>`;
            }
        }
    } catch (e) {}
}

let ultimoCalculoRuta = 0;
let ultimaLatRuta = 0;
let ultimaLngRuta = 0;

function distanciaEnMetros(lat1, lon1, lat2, lon2) {
    let dLat = (lat2 - lat1) * Math.PI / 180;
    let dLon = (lon2 - lon1) * Math.PI / 180;
    let a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return 6371000 * c;
}

async function actualizarRutaEnMovimiento(lat1, lon1, lat2, lon2) {
    let ahora = Date.now();
    let seDesvio = (ultimaLatRuta === 0) || (distanciaEnMetros(lat1, lon1, ultimaLatRuta, ultimaLngRuta) > 35);
    
    if ((ahora - ultimoCalculoRuta > 6000) || seDesvio) {
        ultimaLatRuta = lat1;
        ultimaLngRuta = lon1;
        await trazarRutaCallesYCalcularMetricas(lat1, lon1, lat2, lon2, null, null);
        ultimoCalculoRuta = ahora;
    }
}

function mostrarMsg(texto, tipo) { const msg = document.getElementById('msgChofer'); msg.textContent = texto; msg.className = 'msg msg-' + tipo + ' show'; setTimeout(() => msg.classList.remove('show'), 4000); }

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && estaConectado) {
        await solicitarWakeLock();
        buscarViajesPendientesRecientes();
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registrado con éxito', reg))
            .catch(err => console.log('Error al registrar Service Worker', err));
    });
}

window.addEventListener('DOMContentLoaded', () => {
    verificarRegistroChofer();
    verificarReseteoDiario();
    actualizarUIEstadisticas();
    initMapa(); 
    escucharNuevosViajes(); 
    solicitarWakeLock(); 
    iniciarRastreoGpsContinuo(); 
    mantenerActivoSegundoPlano();
    
    setTimeout(async () => { 
        await verificarViajeActivoConductor(); 
        await buscarViajesPendientesRecientes(); 
    }, 1000);
});
