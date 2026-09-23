const SUPABASE_URL = 'https://hinqiuvbwygqhbabvxrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpbnFpdXZid3lncWhiYWJ2eHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODIyMzIsImV4cCI6MjA5NTA1ODIzMn0.wdnO33BVRtJ9-va3iqiAdWCttkAzpL5K1-b4vtyDvJA';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let TARIFAS_ACTIVAS = {
    base: 3000,
    km: 600,
    recargo: 1.30,
    horaInicio: 20,
    horaFin: 8
};

const UBICACION_DEFAULT = [-34.54291, -58.71212];

let viajeId = null, subViaje = null, origenCoords = null, destinoCoords = null;
let precioCalculado = 0, distanciaKm = 0, modoDestinoManual = false;
let tipoVehiculoSeleccionado = 'auto';
let mapa = null, markerOrigen = null, markerDestino = null, markerConductor = null, rutaTrazada = null;
let pasajeroNombre = "", pasajeroTelefono = "", pasajeroBase64Foto = "";
let intervaloActualizacionRuta = null;
let canalChatPasajeroSupabase = null;
let puntosLocalesCalles = []; 

let intervaloTimbreInsistente = null;
let audioCtxPasajero = null;
let intervaloAlertaChatPasajero = null;

function reproducirPitidoAudio(frecuencia = 880, duracion = 0.3) {
    try {
        if (!audioCtxPasajero) {
            audioCtxPasajero = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtxPasajero.state === 'suspended') {
            audioCtxPasajero.resume();
        }
        const osc = audioCtxPasajero.createOscillator();
        const gain = audioCtxPasajero.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frecuencia, audioCtxPasajero.currentTime);
        gain.gain.setValueAtTime(0.3, audioCtxPasajero.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtxPasajero.currentTime + duracion);
        osc.connect(gain);
        gain.connect(audioCtxPasajero.destination);
        osc.start();
        osc.stop(audioCtxPasajero.currentTime + duracion);
    } catch (e) {}
}

function iniciarTimbreInsistente() {
    if (intervaloTimbreInsistente) return;
    document.getElementById('alertaTimbreLlegada').classList.add('activo');
    reproducirPitidoAudio(880, 0.3);
    intervaloTimbreInsistente = setInterval(() => {
        reproducirPitidoAudio(880, 0.3);
    }, 1000);
}

function silenciarTimbreLlegada() {
    if (intervaloTimbreInsistente) {
        clearInterval(intervaloTimbreInsistente);
        intervaloTimbreInsistente = null;
    }
    document.getElementById('alertaTimbreLlegada').classList.remove('activo');
}

function activarAlertaChatPasajero() {
    const modal = document.getElementById('modalChatFlotante');
    const btnChat = document.getElementById('btnAbrirChatFlotante');
    if (modal.classList.contains('activo')) return;
    if (intervaloAlertaChatPasajero) return;

    btnChat.classList.add('alerta-mensaje');
    reproducirPitidoAudio(650, 0.25);
    intervaloAlertaChatPasajero = setInterval(() => {
        reproducirPitidoAudio(650, 0.25);
    }, 1500);
}

function detenerAlertaChatPasajero() {
    if (intervaloAlertaChatPasajero) {
        clearInterval(intervaloAlertaChatPasajero);
        intervaloAlertaChatPasajero = null;
    }
    const btnChat = document.getElementById('btnAbrirChatFlotante');
    btnChat.classList.remove('alerta-mensaje');
}

async function cargarPuntosLocales() {
    try {
        let respuesta = await fetch('calles.json');
        if (respuesta.ok) {
            puntosLocalesCalles = await respuesta.json();
            console.log("Calles y puntos locales cargados con éxito:", puntosLocalesCalles.length);
        }
    } catch (e) {
        console.error("No se pudo cargar calles.json:", e);
    }
}

async function obtenerDireccionYBarrioPasajero(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
        const data = await res.json();
        if (data && data.address) {
            const calle = data.address.road || data.address.pedestrian || data.address.suburb || "Ubicación actual";
            const altura = data.address.house_number ? ` ${data.address.house_number}` : "";
            const barrio = data.address.suburb || data.address.neighbourhood || data.address.city || data.address.town || "";
            let direccionLimpia = `${calle}${altura}`;
            if (barrio && !direccionLimpia.includes(barrio)) {
                direccionLimpia += ` (${barrio})`;
            }
            return direccionLimpia;
        }
    } catch (e) {}
    return "Ubicación actual";
}

function seleccionarVehiculo(tipo) {
    tipoVehiculoSeleccionado = tipo;
    document.getElementById('optAuto').classList.remove('selected');
    document.getElementById('optMoto').classList.remove('selected');
    
    if (tipo === 'auto') {
        document.getElementById('optAuto').classList.add('selected');
        document.getElementById('iconoVehiculoPreview').textContent = '🚕';
    } else {
        document.getElementById('optMoto').classList.add('selected');
        document.getElementById('iconoVehiculoPreview').textContent = '🏍️';
    }
    recalcularRutaYPrecio();
}

function hablarAnuncioPasajero(texto) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const enunciado = new SpeechSynthesisUtterance(texto);
        enunciado.lang = 'es-AR';
        enunciado.rate = 0.9;
        enunciado.pitch = 1.0;
        window.speechSynthesis.speak(enunciado);
    }
}

async function cargarTarifasDesdeSupabase() {
    try {
        const { data, error } = await supabaseClient
            .from('configuracion_tarifas')
            .select('*')
            .eq('activa', true)
            .single();
            
        if (data && !error) {
            TARIFAS_ACTIVAS.base = Number(data.tarifa_base);
            TARIFAS_ACTIVAS.km = Number(data.tarifa_km);
            TARIFAS_ACTIVAS.recargo = Number(data.recargo_nocturno || 1.30);
            TARIFAS_ACTIVAS.horaInicio = Number(data.hora_inicio_nocturno);
            TARIFAS_ACTIVAS.horaFin = Number(data.hora_fin_nocturno);
        }
    } catch (e) {}

    document.getElementById('txtEstructuraTarifa').innerHTML = 
        `Base $${TARIFAS_ACTIVAS.base.toLocaleString()} + $${TARIFAS_ACTIVAS.km.toLocaleString()} x Km`;

    if (esHorarioNocturno()) {
        document.getElementById('badgeNocturnoAviso').classList.remove('hidden');
    }
    if (esDiaDomingo()) {
        document.getElementById('badgeDomingoAviso').classList.remove('hidden');
    }
}

function esHorarioNocturno() {
    const horaActual = new Date().getHours();
    return (horaActual >= TARIFAS_ACTIVAS.horaInicio || horaActual < TARIFAS_ACTIVAS.horaFin);
}

function esDiaDomingo() {
    const diaActual = new Date().getDay();
    return diaActual === 0;
}

function initMapa() {
    mapa = L.map('mapaLeaflet', { zoomControl: false, attributionControl: false }).setView(UBICACION_DEFAULT, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
    
    cargarPuntosLocales(); 

    mapa.on('click', (e) => { 
        if (modoDestinoManual) {
            marcarDestinoManual(e.latlng.lat, e.latlng.lng); 
        }
    });
}

function toggleExpandirPanel() {
    const panel = document.getElementById('bottomPanel');
    if (panel.classList.contains('modo-compacto')) {
        panel.classList.remove('modo-compacto');
        panel.style.height = '35vh';
    } else {
        panel.style.height = (panel.style.height === '60vh') ? '' : '60vh';
    }
}

async function procesarSplashDeBienvenida() {
    try {
        await cargarTarifasDesdeSupabase();
        
        pasajeroNombre = localStorage.getItem('perfil_nombre') || "";
        pasajeroTelefono = localStorage.getItem('perfil_telefono') || "";
        const fotoGuardada = localStorage.getItem('perfil_foto') || "";
        
        if (fotoGuardada) {
            pasajeroBase64Foto = fotoGuardada;
            const imgPrev = document.getElementById('imgPreview');
            if(imgPrev) {
                imgPrev.src = fotoGuardada;
                imgPrev.style.display = "block";
                document.getElementById('siluetaOverlay').style.opacity = "0";
            }
        }

        if (pasajeroNombre && pasajeroTelefono && pasajeroBase64Foto) {
            document.getElementById('splashTitulo').textContent = `Hola, ${pasajeroNombre}`;
            await verificarViajeActivoPasajero();
            
            setTimeout(() => {
                cerrarSplash(); 
                if (!viajeId) obtenerGPS();
            }, 3000);
        } else {
            document.getElementById('splashTitulo').textContent = "¡Foto y Datos!";
            document.getElementById('splashForm').style.display = "flex";
        }
    } catch (err) {
        document.getElementById('splashTitulo').textContent = "¡Bienvenido!";
        document.getElementById('splashForm').style.display = "flex";
    }
}

function procesarFotoSelfie(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 300;
                canvas.height = 300;
                ctx.drawImage(img, 0, 0, 300, 300);
                
                pasajeroBase64Foto = canvas.toDataURL('image/jpeg', 0.8);
                
                const imgPrev = document.getElementById('imgPreview');
                imgPrev.src = pasajeroBase64Foto;
                imgPrev.style.display = "block";
                document.getElementById('siluetaOverlay').style.opacity = "0.2";
            }
            img.src = e.target.result;
        }
        reader.readAsDataURL(input.files[0]);
    }
}

async function guardarRegistroPerfil() {
    const nom = document.getElementById('regNombre').value.trim();
    const tel = document.getElementById('regTelefono').value.trim();
    if (!pasajeroBase64Foto) { alert("Por favor toca el círculo para tomarte la selfie de seguridad."); return; }
    if (!nom || !tel) { alert("Por favor completa tu nombre y teléfono."); return; }
    
    try {
        localStorage.setItem('perfil_nombre', nom); 
        localStorage.setItem('perfil_telefono', tel);
        localStorage.setItem('perfil_foto', pasajeroBase64Foto);

        await supabaseClient
            .from('perfiles_usuarios')
            .upsert({
                telefono: tel,
                nombre: nom,
                foto: pasajeroBase64Foto,
                tipo: 'pasajero',
                updated_at: new Date()
            }, { onConflict: 'telefono' });
    } catch(e) {}
    
    pasajeroNombre = nom; 
    pasajeroTelefono = tel;
    cerrarSplash(); 
    obtenerGPS();
}

function cerrarSplash() { 
    const splash = document.getElementById('splashScreen'); 
    if(splash) {
        splash.style.opacity = "0"; 
        setTimeout(() => splash.style.display = "none", 500); 
    }
}

async function verificarViajeActivoPasajero() {
    const guardadoId = localStorage.getItem('pasajero_viaje_id');
    if (!guardadoId) return;
    try {
        const { data: viaje } = await supabaseClient.from('viajes').select('*').eq('id', guardadoId).single();
        if (!viaje || viaje.estado === 'finalizado' || viaje.estado === 'cancelado') { limpiarMemoriaPasajero(); return; }

        viajeId = viaje.id;
        origenCoords = { lat: viaje.origen_lat, lng: viaje.origen_lng };
        destinoCoords = { lat: viaje.destino_lat, lng: viaje.destino_lng };
        precioCalculado = viaje.precio; 
        distanciaKm = viaje.distancia_km;
        if (viaje.tipo_vehiculo) seleccionarVehiculo(viaje.tipo_vehiculo);

        markerOrigen = L.marker([origenCoords.lat, origenCoords.lng], { icon: L.divIcon({ className: 'pasajero-ping-icon' }) }).addTo(mapa);
        markerDestino = L.marker([destinoCoords.lat, destinoCoords.lng], { icon: L.divIcon({ className: 'destino-ping-icon' }) }).addTo(mapa);
        
        const direccionRealOrigen = await obtenerDireccionYBarrioPasajero(origenCoords.lat, origenCoords.lng);
        document.getElementById('origenDisplay').value = direccionRealOrigen;
        document.getElementById('destino').value = "Destino seleccionado";

        await recalcularRutaYPrecio();

        if (viaje.estado === 'pendiente' && !viaje.conductor_nombre) {
            mostrarPaso('pasoEsperando');
        } else {
            document.getElementById('precioMonto').textContent = 'Total a pagar: $' + viaje.precio;
            document.getElementById('nombreCond').textContent = viaje.conductor_nombre || "Conductor Asignado";
            document.getElementById('autoCond').textContent = viaje.conductor_auto || "Vehículo en camino";
            if(viaje.conductor_foto) { document.getElementById('imgCondFoto').src = viaje.conductor_foto; }
            
            if(viaje.estado === 'aceptado') {
                document.getElementById('estadoViajePasajero').innerHTML = "🔔 ¡EL MÓVIL YA LLEGÓ A LA PUERTA! 🔔";
                iniciarTimbreInsistente();
            } else if (viaje.estado === 'en_viaje') {
                document.getElementById('estadoViajePasajero').innerHTML = "🧭 Viajando seguro hacia tu destino...";
                iniciarMonitoreoDinamicoRuta();
            }
            mostrarPaso('pasoPrecio');
            document.getElementById('btnAbrirChatFlotante').style.display = 'flex';
            iniciarChatPasajero(viaje.id);
        }
        iniciarEscuchaRealtime(viajeId);
    } catch (e) { limpiarMemoriaPasajero(); }
}

function limpiarMemoriaPasajero() { 
    localStorage.removeItem('pasajero_viaje_id'); 
    if (intervaloActualizacionRuta) clearInterval(intervaloActualizacionRuta);
    silenciarTimbreLlegada();
    detenerAlertaChatPasajero();
}

function iniciarEscuchaRealtime(id) {
    if (subViaje) supabaseClient.removeChannel(subViaje);
    subViaje = supabaseClient
        .channel('viaje-' + id)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'viajes', filter: 'id=eq.' + id }, 
        (payload) => {
            const de = payload.new;

            if (de.conductor_lat && de.conductor_lng) {
                const latLngCond = [de.conductor_lat, de.conductor_lng];
                if (!markerConductor) {
                    markerConductor = L.marker(latLngCond, { 
                        icon: L.divIcon({ className: 'auto-conductor-ping', html: de.tipo_vehiculo === 'moto' ? '🏍️' : '🚗', iconSize: [30, 30] }) 
                    }).addTo(mapa);
                } else {
                    markerConductor.setLatLng(latLngCond);
                }
            }

            if (de.conductor_nombre && de.estado === 'pendiente') {
                document.getElementById('precioMonto').textContent = 'Total a pagar: $' + de.precio;
                document.getElementById('nombreCond').textContent = de.conductor_nombre;
                document.getElementById('autoCond').textContent = de.conductor_auto;
                if(de.conductor_foto) { document.getElementById('imgCondFoto').src = de.conductor_foto; }
                document.getElementById('estadoViajePasajero').innerHTML = "El móvil va en camino 🚗";
                
                if (markerConductor && markerOrigen) {
                    const group = new L.featureGroup([markerOrigen, markerConductor]);
                    mapa.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 17 });
                }
                mostrarPaso('pasoPrecio');
                document.getElementById('btnAbrirChatFlotante').style.display = 'flex';
                iniciarChatPasajero(id);
            }
            if (de.estado === 'aceptado') {
                document.getElementById('estadoViajePasajero').innerHTML = "🔔 ¡EL MÓVIL YA LLEGÓ A LA PUERTA! 🔔";
                mostrarMsg('¡Tu móvil está en la puerta!', 'success');
                hablarAnuncioPasajero("Tu móvil ya llegó a la puerta.");
                iniciarTimbreInsistente();
            }
            if (de.estado === 'en_viaje') {
                silenciarTimbreLlegada();
                document.getElementById('estadoViajePasajero').innerHTML = "🧭 Viajando seguro hacia tu destino...";
                iniciarMonitoreoDinamicoRuta();
            }
            if (de.estado === 'cancelado') { 
                mostrarMsg('Viaje cancelado.', 'error'); 
                limpiarMemoriaPasajero(); 
                setTimeout(() => location.reload(), 2000); 
            }
            if (de.estado === 'finalizado') { 
                mostrarMsg('¡Viaje completado!', 'success'); 
                limpiarMemoriaPasajero(); 
                setTimeout(() => location.reload(), 3000); 
            }
        }).subscribe();
}

function toggleChatFlotante() {
    const modal = document.getElementById('modalChatFlotante');
    modal.classList.toggle('activo');
    if (modal.classList.contains('activo')) {
        detenerAlertaChatPasajero();
    }
}

function iniciarChatPasajero(viajeIdActivo) {
    cargarHistorialMensajesPasajero(viajeIdActivo);
    if (canalChatPasajeroSupabase) supabaseClient.removeChannel(canalChatPasajeroSupabase);

    canalChatPasajeroSupabase = supabaseClient.channel(`chat_viaje_pasajero_${viajeIdActivo}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'mensajes',
            filter: `viaje_id=eq.${viajeIdActivo}`
        }, payload => {
            agregarMensajeAlDomPasajero(payload.new);
            if (payload.new.emisor === 'conductor' || payload.new.emisor === 'admin') {
                activarAlertaChatPasajero();
            }
        })
        .subscribe();
}

async function cargarHistorialMensajesPasajero(viajeIdActivo) {
    try {
        const { data } = await supabaseClient
            .from('mensajes')
            .select('*')
            .eq('viaje_id', viajeIdActivo)
            .order('created_at', { ascending: true });

        const listaHtml = document.getElementById('listaMensajesChatPasajero');
        if (!listaHtml) return;
        listaHtml.innerHTML = '';
        
        if (data && data.length > 0) {
            data.forEach(msg => agregarMensajeAlDomPasajero(msg));
        } else {
            listaHtml.innerHTML = '<div style="color: var(--texto-secundario); text-align: center; font-size: 0.75rem;">Sin mensajes aún.</div>';
        }
    } catch (e) {}
}

async function enviarMensajeChatPasajero() {
    const inp = document.getElementById('inpMensajeChatPasajero');
    const texto = inp.value.trim();
    if (!texto || !viajeId) return;

    try {
        inp.value = '';
        await supabaseClient.from('mensajes').insert({
            viaje_id: viajeId,
            emisor: 'pasajero',
            mensaje: texto
        });
    } catch (e) {
        alert('No se pudo enviar el mensaje.');
    }
}

function agregarMensajeAlDomPasajero(msg) {
    const listaHtml = document.getElementById('listaMensajesChatPasajero');
    if (!listaHtml) return;
    if (listaHtml.innerHTML.includes('Sin mensajes aún')) {
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

function activarModoManualDestino() { 
    modoDestinoManual = true; 
    document.getElementById('manualBtn').classList.add('activo'); 
    document.getElementById('hintManual').classList.add('visible'); 
}

function marcarDestinoManual(lat, lng) {
    destinoCoords = { lat, lng }; 
    if (markerDestino) mapa.removeLayer(markerDestino);
    markerDestino = L.marker([lat, lng], { icon: L.divIcon({ className: 'destino-ping-icon' }) }).addTo(mapa);
    
    obtenerDireccionYBarrioPasajero(lat, lng).then(dir => {
        document.getElementById('destino').value = dir;
    });

    modoDestinoManual = false; 
    document.getElementById('manualBtn').classList.remove('activo'); 
    document.getElementById('hintManual').classList.remove('visible');
    recalcularRutaYPrecio();
}

async function marcarOrigen(lat, lng, labelPersonalizada = null) {
    origenCoords = { lat, lng }; 
    if (markerOrigen) mapa.removeLayer(markerOrigen);
    markerOrigen = L.marker([lat, lng], { icon: L.divIcon({ className: 'pasajero-ping-icon' }) }).addTo(mapa);
    
    document.getElementById('origenDisplay').value = "Buscando calle real...";
    const direccionReal = labelPersonalizada || await obtenerDireccionYBarrioPasajero(lat, lng);
    document.getElementById('origenDisplay').value = direccionReal;

    recalcularRutaYPrecio();
}

function obtenerGPS() {
    if (!navigator.geolocation) { usarUbicacionDefault(); return; }
    document.getElementById('gpsBtn').classList.add('buscando');
    navigator.geolocation.getCurrentPosition(
        (pos) => { 
            document.getElementById('gpsBtn').classList.remove('buscando'); 
            marcarOrigen(pos.coords.latitude, pos.coords.longitude); 
            mapa.setView([pos.coords.latitude, pos.coords.longitude], 16); 
        },
        () => { 
            document.getElementById('gpsBtn').classList.remove('buscando'); 
            usarUbicacionDefault(); 
        },
        { enableHighAccuracy: true, timeout: 7000 }
    );
}

function usarUbicacionDefault() { 
    marcarOrigen(UBICACION_DEFAULT[0], UBICACION_DEFAULT[1], "Ubicación predeterminada"); 
    mapa.setView(UBICACION_DEFAULT, 16); 
}

// ==========================================================
// RUTEO NATURAL DE PUNTO A PUNTO (SIN PUNTOS FORZADOS)
// ==========================================================
async function recalcularRutaYPrecio(puntoOrigenPersonalizado = null) {
    let inicio = puntoOrigenPersonalizado || origenCoords;
    if (!inicio || !destinoCoords) return;
    
    try {
        const url = `https://router.project-osrm.org/route/v1/car/${inicio.lng},${inicio.lat};${destinoCoords.lng},${destinoCoords.lat}?overview=full&geometries=geojson&steps=true&continue_straight=default`;
        const res = await fetch(url); 
        const data = await res.json();
        
        if (data.code === 'Ok' && data.routes.length > 0) {
            if (rutaTrazada) mapa.removeLayer(rutaTrazada);
            
            rutaTrazada = L.polyline(data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]), { color: '#2cd44a', weight: 4.5, opacity: 0.85 }).addTo(mapa);
            distanciaKm = parseFloat((data.routes[0].distance / 1000).toFixed(1));
            
            let baseCalculo = TARIFAS_ACTIVAS.base + (distanciaKm * TARIFAS_ACTIVAS.km);
            
            if (esDiaDomingo() || esHorarioNocturno()) { 
                baseCalculo = baseCalculo * TARIFAS_ACTIVAS.recargo; 
            }

            let precioAuto = Math.round(baseCalculo);
            let precioMoto = Math.round(baseCalculo * 0.75);

            document.getElementById('precioAutoTxt').textContent = '$' + precioAuto;
            document.getElementById('precioMotoTxt').textContent = '$' + precioMoto;

            precioCalculado = (tipoVehiculoSeleccionado === 'auto') ? precioAuto : precioMoto;

            if (!document.getElementById('pasoPrecio').classList.contains('hidden')) {
                document.getElementById('bottomPanel').classList.add('modo-compacto');
            } else {
                document.getElementById('bottomPanel').classList.add('con-ruta');
            }
            
            if (!puntoOrigenPersonalizado) {
                mapa.fitBounds(rutaTrazada.getBounds(), { padding: [35, 35], maxZoom: 16.5 });
            }
        }
    } catch (e) {}
}

function iniciarMonitoreoDinamicoRuta() {
    if (intervaloActualizacionRuta) clearInterval(intervaloActualizacionRuta);
    intervaloActualizacionRuta = setInterval(async () => {
        if (markerConductor && destinoCoords && viajeId) {
            const posActualChofer = markerConductor.getLatLng();
            await recalcularRutaYPrecio({ lat: posActualChofer.lat, lng: posActualChofer.lng });
        }
    }, 10000);
}

// ==========================================================
// BUSCADOR INTELIGENTE Y FLEXIBLE (SIN TILDES Y ORDEN LIBRE)
// ==========================================================
let timeoutBusqueda = null;
function buscarDireccion(query) {
    clearTimeout(timeoutBusqueda);
    if (query.length < 2) { 
        document.getElementById('sugerencias').classList.remove('activo'); 
        return; 
    }

    timeoutBusqueda = setTimeout(async () => {
        let resultadosHtml = '';

        if (puntosLocalesCalles && puntosLocalesCalles.length > 0) {
            const limpiarTexto = (txt) => txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const queryLimia = limpiarTexto(query);
            const palabrasQuery = queryLimia.split(' ').filter(p => p.length > 0);

            let filtradosLocales = puntosLocalesCalles.filter(p => {
                let nombreLugar = limpiarTexto(p.nombre);
                let zonaLugar = limpiarTexto(p.zona || '');
                let textoCompleto = nombreLugar + ' ' + zonaLugar;

                return palabrasQuery.every(palabra => textoCompleto.includes(palabra));
            }).slice(0, 4);

            filtradosLocales.forEach(lugar => {
                resultadosHtml += `
                    <div class="sugerencia-item" onclick="seleccionarDestinoLocal('${lugar.nombre.replace(/'/g, "")}', ${lugar.lat}, ${lugar.lng})">
                        <strong>📍 ${lugar.nombre}</strong>
                        <div style="font-size:0.7rem; color:var(--color-primario);">Zona: ${lugar.zona || 'Local'}</div>
                    </div>
                `;
            });
        }

        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Buenos Aires')}&limit=4`;
            const res = await fetch(url); 
            const datosGeo = await res.json();
            
            datosGeo.forEach(lugar => {
                let nombreCorto = lugar.display_name.split(',')[0];
                let resto = lugar.display_name.split(',').slice(1,3).join(',');
                resultadosHtml += `
                    <div class="sugerencia-item" onclick="seleccionarDestino('${lugar.display_name.replace(/'/g, "")}', ${lugar.lat}, ${lugar.lon})">
                        <strong>🎯 ${nombreCorto}</strong>
                        <div style="font-size:0.7rem; color:var(--texto-secundario);">${resto}</div>
                    </div>
                `;
            });
        } catch (e) {}

        const contenedorSugerencias = document.getElementById('sugerencias');
        if (resultadosHtml) {
            contenedorSugerencias.innerHTML = resultadosHtml;
            contenedorSugerencias.classList.add('activo');
        } else {
            contenedorSugerencias.classList.remove('activo');
        }
    }, 300);
}

function seleccionarDestinoLocal(nombre, lat, lng) {
    document.getElementById('destino').value = nombre;
    document.getElementById('sugerencias').classList.remove('activo');
    destinoCoords = { lat: parseFloat(lat), lng: parseFloat(lng) };
    if (markerDestino) mapa.removeLayer(markerDestino);
    markerDestino = L.marker([lat, lng], { icon: L.divIcon({ className: 'destino-ping-icon' }) }).addTo(mapa);
    recalcularRutaYPrecio();
}

function seleccionarDestino(direccion, lat, lng) {
    document.getElementById('destino').value = direccion.split(',')[0];
    document.getElementById('sugerencias').classList.remove('activo');
    destinoCoords = { lat: parseFloat(lat), lng: parseFloat(lng) };
    if (markerDestino) mapa.removeLayer(markerDestino);
    markerDestino = L.marker([lat, lng], { icon: L.divIcon({ className: 'destino-ping-icon' }) }).addTo(mapa);
    recalcularRutaYPrecio();
}

async function solicitarViaje() {
    const destinoTexto = document.getElementById('destino').value.trim();
    if (!destinoTexto || !origenCoords || !destinoCoords) { mostrarMsg('Seleccioná un destino válido.', 'error'); return; }

    if (origenCoords.lat === UBICACION_DEFAULT[0] && origenCoords.lng === UBICACION_DEFAULT[1]) {
        mostrarMsg('Por favor presiona el botón de GPS (🎯) para obtener tu ubicación exacta antes de pedir.', 'error');
        return;
    }

    try {
        let precioFinalACobrar = precioCalculado;
        let esDescuentoFidelidad = false;

        if (pasajeroTelefono) {
            const { data: viajesPrevios, error: errHistorial } = await supabaseClient
                .from('viajes')
                .select('*')
                .eq('pasajero_telefono', pasajeroTelefono)
                .in('estado', ['finalizado', 'completado']);

            if (!errHistorial) {
                let totalViajesPrevios = viajesPrevios ? viajesPrevios.length : 0;
                let numeroDeEsteViaje = totalViajesPrevios + 1;

                if (numeroDeEsteViaje % 6 === 0) {
                    if (distanciaKm <= 12) {
                        precioFinalACobrar = Math.round(precioCalculado / 2);
                        esDescuentoFidelidad = true;
                    } else {
                        mostrarMsg('⚠️ Tu 6to viaje supera los 12 km permitidos para la promo. Se aplicará la tarifa normal.', 'error');
                    }
                }
            }
        }

        const { data, error } = await supabaseClient
            .from('viajes')
            .insert({
                estado: 'pendiente',
                pasajero_nombre: pasajeroNombre || "Pasajero",
                pasajero_telefono: pasajeroTelefono || "Sin teléfono",
                pasajero_foto: pasajeroBase64Foto || "",
                tipo_vehiculo: tipoVehiculoSeleccionado,
                origen_lat: origenCoords.lat,
                origen_lng: origenCoords.lng,
                destino_lat: destinoCoords.lat,
                destino_lng: destinoCoords.lng,
                precio: precioFinalACobrar,
                distancia_km: distanciaKm
            }).select().single();

        if (error) throw error;
        viajeId = data.id;
        localStorage.setItem('pasajero_viaje_id', data.id);
        
        const avisoEspera = document.getElementById('avisoFidelidadEspera');
        const avisoAsignado = document.getElementById('avisoFidelidadAsignado');
        
        if (esDescuentoFidelidad) {
            if (avisoEspera) avisoEspera.classList.remove('hidden');
            if (avisoAsignado) avisoAsignado.classList.remove('hidden');
        } else {
            if (avisoEspera) avisoEspera.classList.add('hidden');
            if (avisoAsignado) avisoAsignado.classList.add('hidden');
        }

        mostrarPaso('pasoEsperando');
        iniciarEscuchaRealtime(viajeId);
    } catch (e) { mostrarMsg('Error al solicitar: ' + e.message, 'error'); }
}

async function cancelarViaje() { 
    if(viajeId) { 
        await supabaseClient.from('viajes').update({ estado: 'cancelado' }).eq('id', viajeId); 
    } 
    limpiarMemoriaPasajero(); 
    location.reload(); 
}

function volverAtras() { cancelarViaje(); }

function mostrarPaso(id) { 
    ['pasoDatos', 'pasoEsperando', 'pasoPrecio'].forEach(p => document.getElementById(p).classList.add('hidden')); 
    document.getElementById(id).classList.remove('hidden'); 
    
    const panel = document.getElementById('bottomPanel');
    if (id === 'pasoPrecio') {
        panel.classList.add('modo-compacto');
        panel.classList.remove('con-ruta');
    } else {
        panel.classList.remove('modo-compacto');
    }
}

function mostrarMsg(texto, tipo) { 
    const msg = document.getElementById('msg'); 
    msg.textContent = texto; 
    msg.className = 'msg msg-' + tipo + ' show'; 
    setTimeout(() => {
        if(!texto.includes('6to viaje')) {
            msg.classList.remove('show');
        }
    }, 8000); 
}

window.addEventListener('DOMContentLoaded', () => { initMapa(); procesarSplashDeBienvenida(); });
