Const SUPABASE_URL = 'https://hinqiuvbwygqhbabvxrc.supabase.co';
Const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpbnFpdXZid3lncWhiYWJ2eHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODIyMzIsImV4cCI6MjA5NTA1ODIzMn0.wdnO33BVRtJ9-va3iqiAdWCttkAzpL5K1-b4vtyDvJA';
Const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

Let TARIFAS_ACTIVAS = {
    Base: 3500,
    Km: 800,
    Recargo: 1.30,
    HoraInicio: 20,
    HoraFin: 8
};

Const UBICACION_DEFAULT = [-34.54291, -58.71212];

Let viajeId = null, subViaje = null, origenCoords = null, destinoCoords = null;
Let precioCalculado = 0, distanciaKm = 0, modoDestinoManual = false;
Let tipoVehiculoSeleccionado = 'auto';
Let mapa = null, markerOrigen = null, markerDestino = null, markerConductor = null, rutaTrazada = null;
Let pasajeroNombre = "", pasajeroTelefono = "", pasajeroBase64Foto = "";
Let intervaloActualizacionRuta = null;
Let canalChatPasajeroSupabase = null;
Let puntosLocalesCalles = []; 

Let intervaloTimbreInsistente = null;
Let audioCtxPasajero = null;
Let intervaloAlertaChatPasajero = null;
Let watchIdPasajero = null; 
Let usuarioMoviendoMapa = false;
Let origenManualSeleccionado = false; // NUEVO: Bandera para saber si el usuario cambió el origen manualmente

Function reproducirPitidoAudio(frecuencia = 880, duracion = 0.3) {
    Try {
        If (!audioCtxPasajero) {
            AudioCtxPasajero = new (window.AudioContext || window.webkitAudioContext)();
        }
        If (audioCtxPasajero.state === 'suspended') {
            AudioCtxPasajero.resume();
        }
        Const osc = audioCtxPasajero.createOscillator();
        Const gain = audioCtxPasajero.createGain();
        Osc.type = 'sine';
        Osc.frequency.setValueAtTime(frecuencia, audioCtxPasajero.currentTime);
        Gain.gain.setValueAtTime(0.3, audioCtxPasajero.currentTime);
        Gain.gain.exponentialRampToValueAtTime(0.01, audioCtxPasajero.currentTime + duracion);
        Osc.connect(gain);
        Gain.connect(audioCtxPasajero.destination);
        Osc.start();
        Osc.stop(audioCtxPasajero.currentTime + duracion);
    } catch (e) {}
}

Function iniciarTimbreInsistente() {
    If (intervaloTimbreInsistente) return;
    Document.getElementById('alertaTimbreLlegada').classList.add('activo');
    ReproducirPitidoAudio(880, 0.3);
    IntervaloTimbreInsistente = setInterval(() => {
        ReproducirPitidoAudio(880, 0.3);
    }, 1000);
}

Function silenciarTimbreLlegada() {
    If (intervaloTimbreInsistente) {
        clearInterval(intervaloTimbreInsistente);
        IntervaloTimbreInsistente = null;
    }
    Document.getElementById('alertaTimbreLlegada').classList.remove('activo');
}

Function activarAlertaChatPasajero() {
    Const modal = document.getElementById('modalChatFlotante');
    Const btnChat = document.getElementById('btnAbrirChatFlotante');
    If (modal.classList.contains('activo')) return;
    If (intervaloAlertaChatPasajero) return;

    BtnChat.classList.add('alerta-mensaje');
    ReproducirPitidoAudio(650, 0.25);
    IntervaloAlertaChatPasajero = setInterval(() => {
        ReproducirPitidoAudio(650, 0.25);
    }, 1500);
}

Function detenerAlertaChatPasajero() {
    If (intervaloAlertaChatPasajero) {
        clearInterval(intervaloAlertaChatPasajero);
        IntervaloAlertaChatPasajero = null;
    }
    Const btnChat = document.getElementById('btnAbrirChatFlotante');
    BtnChat.classList.remove('alerta-mensaje');
}

Async function cargarPuntosLocales() {
    Try {
        Let respuesta = await fetch('calles.json');
        If (respuesta.ok) {
            PuntosLocalesCalles = await respuesta.json();
        }
    } catch (e) {}
}

Async function obtenerDireccionYBarrioPasajero(lat, lon) {
    Try {
        Const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
        Const data = await res.json();
        If (data && data.address) {
            Const calle = data.address.road || data.address.pedestrian || data.address.suburb || "Ubicación actual";
            Const altura = data.address.house_number ? ` ${data.address.house_number}` : "";
            Const barrio = data.address.suburb || data.address.neighbourhood || data.address.city || data.address.town || "";
            Let direccionLimpia = `${calle}${altura}`;
            If (barrio && !direccionLimpia.includes(barrio)) {
                DireccionLimpia += ` (${barrio})`;
            }
            Return direccionLimpia;
        }
    } catch (e) {}
    Return "Ubicación actual";
}

Function seleccionarVehiculo(tipo) {
    TipoVehiculoSeleccionado = tipo;
    Document.getElementById('optAuto').classList.remove('selected');
    Document.getElementById('optMoto').classList.remove('selected');
    
    If (tipo === 'auto') {
        Document.getElementById('optAuto').classList.add('selected');
        Document.getElementById('iconoVehiculoPreview').textContent = '🚕';
    } else {
        Document.getElementById('optMoto').classList.add('selected');
        Document.getElementById('iconoVehiculoPreview').textContent = '🏍️';
    }
    RecalcularRutaYPrecio();
}

Function hablarAnuncioPasajero(texto) {
    If ('speechSynthesis' in window) {
        Window.speechSynthesis.cancel();
        Const enunciado = new SpeechSynthesisUtterance(texto);
        Enunciado.lang = 'es-AR';
        Enunciado.rate = 0.9;
        Enunciado.pitch = 1.0;
        Window.speechSynthesis.speak(enunciado);
    }
}

Async function cargarTarifasDesdeSupabase() {
    Try {
        Const { data, error } = await supabaseClient
            .from('configuracion_tarifas')
            .select('*')
            .eq('activa', true)
            .single();
            
        If (data && !error) {
            TARIFAS_ACTIVAS.base = Number(data.tarifa_base);
            TARIFAS_ACTIVAS.km = Number(data.tarifa_km);
            TARIFAS_ACTIVAS.recargo = Number(data.recargo_nocturno || 1.30);
            TARIFAS_ACTIVAS.horaInicio = Number(data.hora_inicio_nocturno);
            TARIFAS_ACTIVAS.horaFin = Number(data.hora_fin_nocturno);
        }
    } catch (e) {}

    Document.getElementById('txtEstructuraTarifa').innerHTML = 
        `Base $${TARIFAS_ACTIVAS.base.toLocaleString()} + $${TARIFAS_ACTIVAS.km.toLocaleString()} x Km (primeros 2 km incluidos)`;

    If (esHorarioNocturno()) {
        Document.getElementById('badgeNocturnoAviso').classList.remove('hidden');
    }
    If (esDiaDomingo()) {
        Document.getElementById('badgeDomingoAviso').classList.remove('hidden');
    }
}

Function esHorarioNocturno() {
    Const horaActual = new Date().getHours();
    Return (horaActual >= TARIFAS_ACTIVAS.horaInicio || horaActual < TARIFAS_ACTIVAS.horaFin);
}

Function esDiaDomingo() {
    Const diaActual = new Date().getDay();
    Return diaActual === 0;
}

Function initMapa() {
    Mapa = L.map('mapaLeaflet', { zoomControl: false, attributionControl: false }).setView(UBICACION_DEFAULT, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
    
    CargarPuntosLocales(); 

    Mapa.on('movestart', () => {
        If (!viajeId) {
            UsuarioMoviendoMapa = true;
        }
    });

    Mapa.on('click', (e) => { 
        If (modoDestinoManual) {
            MarcarDestinoManual(e.latlng.lat, e.latlng.lng); 
        }
    });
}

Function toggleExpandirPanel() {
    Const panel = document.getElementById('bottomPanel');
    If (panel.classList.contains('modo-compacto')) {
        Panel.classList.remove('modo-compacto');
        Panel.style.height = '35vh';
    } else {
        Panel.style.height = (panel.style.height === '60vh') ? '' : '60vh';
    }
}

Async function procesarSplashDeBienvenida() {
    Try {
        Await cargarTarifasDesdeSupabase();
        
        PasajeroNombre = localStorage.getItem('perfil_nombre') || "";
        PasajeroTelefono = localStorage.getItem('perfil_telefono') || "";
        Const fotoGuardada = localStorage.getItem('perfil_foto') || "";
        
        If (fotoGuardada) {
            PasajeroBase64Foto = fotoGuardada;
            Const imgPrev = document.getElementById('imgPreview');
            If(imgPrev) {
                ImgPrev.src = fotoGuardada;
                ImgPrev.style.display = "block";
                Document.getElementById('siluetaOverlay').style.opacity = "0";
            }
        }

        If (pasajeroNombre && pasajeroTelefono && pasajeroBase64Foto) {
            Document.getElementById('splashTitulo').textContent = `Hola, ${pasajeroNombre}`;
            Await verificarViajeActivoPasajero();
            
            SetTimeout(() => {
                CerrarSplash(); 
                If (!viajeId) obtenerGPS();
            }, 3000);
        } else {
            Document.getElementById('splashTitulo').textContent = "¡Foto y Datos!";
            Document.getElementById('splashForm').style.display = "flex";
        }
    } catch (err) {
        Document.getElementById('splashTitulo').textContent = "¡Bienvenido!";
        Document.getElementById('splashForm').style.display = "flex";
    }
}

Function procesarFotoSelfie(input) {
    If (input.files && input.files[0]) {
        Const reader = new FileReader();
        Reader.onload = function(e) {
            Const img = new Image();
            Img.onload = function() {
                Const canvas = document.createElement('canvas');
                Const ctx = canvas.getContext('2d');
                Canvas.width = 300;
                Canvas.height = 300;
                Ctx.drawImage(img, 0, 0, 300, 300);
                
                PasajeroBase64Foto = canvas.toDataURL('image/jpeg', 0.8);
                
                Const imgPrev = document.getElementById('imgPreview');
                ImgPrev.src = pasajeroBase64Foto;
                ImgPrev.style.display = "block";
                Document.getElementById('siluetaOverlay').style.opacity = "0.2";
            }
            Img.src = e.target.result;
        }
        Reader.readAsDataURL(input.files[0]);
    }
}

Async function guardarRegistroPerfil() {
    Const nom = document.getElementById('regNombre').value.trim();
    Const tel = document.getElementById('regTelefono').value.trim();
    If (!pasajeroBase64Foto) { alert("Por favor toca el círculo para tomarte la selfie de seguridad."); return; }
    If (!nom || !tel) { alert("Por favor completa tu nombre y teléfono."); return; }
    
    Try {
        LocalStorage.setItem('perfil_nombre', nom); 
        LocalStorage.setItem('perfil_telefono', tel);
        LocalStorage.setItem('perfil_foto', pasajeroBase64Foto);

        Await supabaseClient
            .from('perfiles_usuarios')
            .upsert({
                Telefono: tel,
                Nombre: nom,
                Foto: pasajeroBase64Foto,
                Tipo: 'pasajero',
                Updated_at: new Date()
            }, { onConflict: 'telefono' });
    } catch(e) {}
    
    PasajeroNombre = nom; 
    PasajeroTelefono = tel;
    CerrarSplash(); 
    ObtenerGPS();
}

Function cerrarSplash() { 
    Const splash = document.getElementById('splashScreen'); 
    If(splash) {
        Splash.style.opacity = "0"; 
        SetTimeout(() => splash.style.display = "none", 500); 
    }
}

Async function verificarViajeActivoPasajero() {
    Const guardadoId = localStorage.getItem('pasajero_viaje_id');
    If (!guardadoId) return;
    Try {
        Const { data: viaje } = await supabaseClient.from('viajes').select('*').eq('id', guardadoId).single();
        If (!viaje || viaje.estado === 'finalizado' || viaje.estado === 'cancelado') { limpiarMemoriaPasajero(); return; }

        ViajeId = viaje.id;
        OrigenCoords = { lat: viaje.origen_lat, lng: viaje.origen_lng };
        DestinoCoords = { lat: viaje.destino_lat, lng: viaje.destino_lng };
        PrecioCalculado = viaje.precio; 
        DistanciaKm = viaje.distancia_km;
        If (viaje.tipo_vehiculo) seleccionarVehiculo(viaje.tipo_vehiculo);

        MarkerOrigen = L.marker([origenCoords.lat, origenCoords.lng], { icon: L.divIcon({ className: 'pasajero-ping-icon' }) }).addTo(mapa);
        MarkerDestino = L.marker([destinoCoords.lat, destinoCoords.lng], { icon: L.divIcon({ className: 'destino-ping-icon' }) }).addTo(mapa);
        
        Const direccionRealOrigen = await obtenerDireccionYBarrioPasajero(origenCoords.lat, origenCoords.lng);
        Document.getElementById('origenDisplay').value = direccionRealOrigen;
        Document.getElementById('destino').value = "Destino seleccionado";

        Await recalcularRutaYPrecio();

        If (viaje.estado === 'pendiente' && !viaje.conductor_nombre) {
            MostrarPaso('pasoEsperando');
        } else {
            Document.getElementById('precioMonto').textContent = 'Total a pagar: $' + viaje.precio;
            Document.getElementById('nombreCond').textContent = viaje.conductor_nombre || "Conductor Asignado";
            Document.getElementById('autoCond').textContent = viaje.conductor_auto || "Vehículo en camino";
            If(viaje.conductor_foto) { document.getElementById('imgCondFoto').src = viaje.conductor_foto; }
            
            If(viaje.estado === 'aceptado') {
                Document.getElementById('estadoViajePasajero').innerHTML = "🔔 ¡EL MÓVIL YA LLEGÓ A LA PUERTA! 🔔";
                IniciarTimbreInsistente();
            } else if (viaje.estado === 'en_viaje') {
                Document.getElementById('estadoViajePasajero').innerHTML = "🧭 Viajando seguro hacia tu destino...";
                IniciarMonitoreoDinamicoRuta();
            }
            MostrarPaso('pasoPrecio');
            Document.getElementById('btnAbrirChatFlotante').style.display = 'flex';
            IniciarChatPasajero(viaje.id);
        }
        IniciarEscuchaRealtime(viajeId);
    } catch (e) { limpiarMemoriaPasajero(); }
}

Function limpiarMemoriaPasajero() { 
    LocalStorage.removeItem('pasajero_viaje_id'); 
    If (intervaloActualizacionRuta) clearInterval(intervaloActualizacionRuta);
    If (watchIdPasajero !== null) {
        Navigator.geolocation.clearWatch(watchIdPasajero);
        WatchIdPasajero = null;
    }
    SilenciarTimbreLlegada();
    DetenerAlertaChatPasajero();
}

Function iniciarEscuchaRealtime(id) {
    If (subViaje) supabaseClient.removeChannel(subViaje);
    SubViaje = supabaseClient
        .channel('viaje-' + id)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'viajes', filter: 'id=eq.' + id }, 
        (payload) => {
            Const de = payload.new;

            If (de.conductor_lat && de.conductor_lng) {
                Const latLngCond = [de.conductor_lat, de.conductor_lng];
                If (!markerConductor) {
                    MarkerConductor = L.marker(latLngCond, { 
                        Icon: L.divIcon({ className: 'auto-conductor-ping', html: de.tipo_vehiculo === 'moto' ? '🏍️' : '🚗', iconSize: [30, 30] }) 
                    }).addTo(mapa);
                } else {
                    MarkerConductor.setLatLng(latLngCond);
                }

                If (de.estado === 'en_viaje') {
                    Mapa.panTo(latLngCond);
                }
            }

            If (de.conductor_nombre && de.estado === 'pendiente') {
                Document.getElementById('precioMonto').textContent = 'Total a pagar: $' + de.precio;
                Document.getElementById('nombreCond').textContent = de.conductor_nombre;
                Document.getElementById('autoCond').textContent = de.conductor_auto;
                If(de.conductor_foto) { document.getElementById('imgCondFoto').src = de.conductor_foto; }
                Document.getElementById('estadoViajePasajero').innerHTML = "El móvil va en camino 🚗";
                
                If (markerConductor && markerOrigen) {
                    Const group = new L.featureGroup([markerOrigen, markerConductor]);
                    Mapa.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 17 });
                }
                MostrarPaso('pasoPrecio');
                Document.getElementById('btnAbrirChatFlotante').style.display = 'flex';
                IniciarChatPasajero(id);
            }
            If (de.estado === 'aceptado') {
                Document.getElementById('estadoViajePasajero').innerHTML = "🔔 ¡EL MÓVIL YA LLEGÓ A LA PUERTA! 🔔";
                MostrarMsg('¡Tu móvil está en la puerta!', 'success');
                HablarAnuncioPasajero("Tu móvil ya llegó a la puerta.");
                IniciarTimbreInsistente();
            }
            If (de.estado === 'en_viaje') {
                SilenciarTimbreLlegada();
                Document.getElementById('estadoViajePasajero').innerHTML = "🧭 Viajando seguro hacia tu destino...";
                IniciarMonitoreoDinamicoRuta();
            }
            If (de.estado === 'cancelado') { 
                MostrarMsg('Viaje cancelado.', 'error'); 
                LimpiarMemoriaPasajero(); 
                SetTimeout(() => location.reload(), 2000); 
            }
            If (de.estado === 'finalizado') { 
                MostrarMsg('¡Viaje completado!', 'success'); 
                LimpiarMemoriaPasajero(); 
                SetTimeout(() => location.reload(), 3000); 
            }
        }).subscribe();
}

Function toggleChatFlotante() {
    Const modal = document.getElementById('modalChatFlotante');
    Modal.classList.toggle('activo');
    If (modal.classList.contains('activo')) {
        DetenerAlertaChatPasajero();
    }
}

Function iniciarChatPasajero(viajeIdActivo) {
    CargarHistorialMensajesPasajero(viajeIdActivo);
    If (canalChatPasajeroSupabase) supabaseClient.removeChannel(canalChatPasajeroSupabase);

    CanalChatPasajeroSupabase = supabaseClient.channel(`chat_viaje_pasajero_${viajeIdActivo}`)
        .on('postgres_changes', {
            Event: 'INSERT',
            Schema: 'public',
            Table: 'mensajes',
            Filter: `viaje_id=eq.${viajeIdActivo}`
        }, payload => {
            AgregarMensajeAlDomPasajero(payload.new);
            If (payload.new.emisor === 'conductor' || payload.new.emisor === 'admin') {
                ActivarAlertaChatPasajero();
            }
        })
        .subscribe();
}

Async function cargarHistorialMensajesPasajero(viajeIdActivo) {
    Try {
        Const { data } = await supabaseClient
            .from('mensajes')
            .select('*')
            .eq('viaje_id', viajeIdActivo)
            .order('created_at', { ascending: true });

        Const listaHtml = document.getElementById('listaMensajesChatPasajero');
        If (!listaHtml) return;
        ListaHtml.innerHTML = '';
        
        If (data && data.length > 0) {
            Data.forEach(msg => agregarMensajeAlDomPasajero(msg));
        } else {
            ListaHtml.innerHTML = '<div style="color: var(--texto-secundario); text-align: center; font-size: 0.75rem;">Sin mensajes aún.</div>';
        }
    } catch (e) {}
}

Async function enviarMensajeChatPasajero() {
    Const inp = document.getElementById('inpMensajeChatPasajero');
    Const texto = inp.value.trim();
    If (!texto || !viajeId) return;

    Try {
        Inp.value = '';
        Await supabaseClient.from('mensajes').insert({
            Viaje_id: viajeId,
            Emisor: 'pasajero',
            Mensaje: texto
        });
    } catch (e) {
        Alert('No se pudo enviar el mensaje.');
    }
}

Function agregarMensajeAlDomPasajero(msg) {
    Const listaHtml = document.getElementById('listaMensajesChatPasajero');
    If (!listaHtml) return;
    If (listaHtml.innerHTML.includes('Sin mensajes aún')) {
        ListaHtml.innerHTML = '';
    }
    Const div = document.createElement('div');
    Let claseEmisor = 'pasajero';
    If (msg.emisor === 'conductor') claseEmisor = 'conductor';
    If (msg.emisor === 'admin') claseEmisor = 'admin';

    Div.className = `chat-msg-item ${claseEmisor}`;
    Div.innerHTML = `<span style="font-size:0.65rem; opacity:0.7; display:block;"><b>${msg.emisor}:</b></span> ${msg.mensaje}`;
    ListaHtml.appendChild(div);
    ListaHtml.scrollTop = listaHtml.scrollHeight;
}

Function activarModoManualDestino() { 
    ModoDestinoManual = true; 
    UsuarioMoviendoMapa = true; 
    Document.getElementById('manualBtn').classList.add('activo'); 
    Document.getElementById('hintManual').classList.add('visible'); 
}

Function marcarDestinoManual(lat, lng) {
    DestinoCoords = { lat, lng }; 
    If (markerDestino) mapa.removeLayer(markerDestino);
    MarkerDestino = L.marker([lat, lng], { icon: L.divIcon({ className: 'destino-ping-icon' }) }).addTo(mapa);
    
    ObtenerDireccionYBarrioPasajero(lat, lng).then(dir => {
        Document.getElementById('destino').value = dir;
    });

    ModoDestinoManual = false; 
    Document.getElementById('manualBtn').classList.remove('activo'); 
    Document.getElementById('hintManual').classList.remove('visible');
    RecalcularRutaYPrecio();
}

Async function marcarOrigen(lat, lng, labelPersonalizada = null) {
    OrigenCoords = { lat, lng }; 
    If (markerOrigen) {
        MarkerOrigen.setLatLng([lat, lng]);
    } else {
        MarkerOrigen = L.marker([lat, lng], { icon: L.divIcon({ className: 'pasajero-ping-icon' }) }).addTo(mapa);
    }
    
    Const origenDisplay = document.getElementById('origenDisplay');
    
    If (origenDisplay && (!origenDisplay.value || origenDisplay.value.includes("Buscando") || origenDisplay.value === "")) {
        OrigenDisplay.value = "Buscando calle real...";
        Const direccionReal = labelPersonalizada || await obtenerDireccionYBarrioPasajero(lat, lng);
        If (origenDisplay.value.includes("Buscando") || !origenDisplay.value) {
            OrigenDisplay.value = direccionReal;
        }
    }

    RecalcularRutaYPrecio();
}

Function obtenerGPS() {
    If (origenManualSeleccionado) return; // Si eligió origen manual, no sobrescribir con GPS
    If (!navigator.geolocation) { usarUbicacionDefault(); return; }
    Document.getElementById('gpsBtn').classList.add('buscando');
    UsuarioMoviendoMapa = false;

    If (watchIdPasajero !== null) {
        Navigator.geolocation.clearWatch(watchIdPasajero);
    }

    WatchIdPasajero = navigator.geolocation.watchPosition(
        (pos) => { 
            If (origenManualSeleccionado) return; // Doble validación por seguridad
            Document.getElementById('gpsBtn').classList.remove('buscando'); 
            Const lat = pos.coords.latitude;
            Const lng = pos.coords.longitude;
            
            MarcarOrigen(lat, lng); 
            
            If (!viajeId && !destinoCoords && !usuarioMoviendoMapa) {
                Mapa.setView([lat, lng], 16); 
            }
        },
        (err) => { 
            Document.getElementById('gpsBtn').classList.remove('buscando'); 
            Console.warn("Aviso GPS:", err);
            UsarUbicacionDefault(); 
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
}

Function usarUbicacionDefault() { 
    OrigenManualSeleccionado = false;
    MarcarOrigen(UBICACION_DEFAULT[0], UBICACION_DEFAULT[1], "Ubicación predeterminada"); 
    Mapa.setView(UBICACION_DEFAULT, 16); 
}

// ==========================================================
// RUTEO NATURAL DE PUNTO A PUNTO (CON 2 KM INCLUIDOS EN BASE)
// ==========================================================
Async function recalcularRutaYPrecio(puntoOrigenPersonalizado = null) {
    Let inicio = puntoOrigenPersonalizado || origenCoords;
    If (!inicio || !destinoCoords) return;
    
    Try {
        Const url = `https://router.project-osrm.org/route/v1/car/${inicio.lng},${inicio.lat};${destinoCoords.lng},${destinoCoords.lat}?overview=full&geometries=geojson&steps=true&continue_straight=default`;
        Const res = await fetch(url); 
        Const data = await res.json();
        
        If (data.code === 'Ok' && data.routes.length > 0) {
            If (rutaTrazada) mapa.removeLayer(rutaTrazada);
            
            RutaTrazada = L.polyline(data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]), { color: '#2cd44a', weight: 4.5, opacity: 0.85 }).addTo(mapa);
            DistanciaKm = parseFloat((data.routes[0].distance / 1000).toFixed(1));
            
            Let baseCalculo = TARIFAS_ACTIVAS.base;
            Let distanciaIncluidaBase = 2;

            If (distanciaKm > distanciaIncluidaBase) {
                Let kmExcedentes = distanciaKm - distanciaIncluidaBase;
                BaseCalculo += (kmExcedentes * TARIFAS_ACTIVAS.km);
            }
            
            If (esDiaDomingo() || esHorarioNocturno()) { 
                BaseCalculo = baseCalculo * TARIFAS_ACTIVAS.recargo; 
            }

            Let precioAuto = Math.round(baseCalculo);
            Let precioMoto = Math.round(baseCalculo * 0.75);

            Document.getElementById('precioAutoTxt').textContent = '$' + precioAuto;
            Document.getElementById('precioMotoTxt').textContent = '$' + precioMoto;

            PrecioCalculado = (tipoVehiculoSeleccionado === 'auto') ? precioAuto : precioMoto;

            If (!document.getElementById('pasoPrecio').classList.contains('hidden')) {
                Document.getElementById('bottomPanel').classList.add('modo-compacto');
            } else {
                Document.getElementById('bottomPanel').classList.add('con-ruta');
            }
            
            If (!puntoOrigenPersonalizado && !usuarioMoviendoMapa) {
                Mapa.fitBounds(rutaTrazada.getBounds(), { padding: [35, 35], maxZoom: 16.5 });
            }
        }
    } catch (e) {}
}

Function iniciarMonitoreoDinamicoRuta() {
    If (intervaloActualizacionRuta) clearInterval(intervaloActualizacionRuta);
    IntervaloActualizacionRuta = setInterval(async () => {
        If (markerConductor && destinoCoords && viajeId) {
            Const posActualChofer = markerConductor.getLatLng();
            Await recalcularRutaYPrecio({ lat: posActualChofer.lat, lng: posActualChofer.lng });
        }
    }, 10000);
}

// ==========================================================
// BUSCADOR INTELIGENTE Y FLEXIBLE PARA DESTINO
// ==========================================================
Let timeoutBusqueda = null;
Function buscarDireccion(query) {
    ClearTimeout(timeoutBusqueda);
    If (query.length < 2) { 
        Document.getElementById('sugerencias').classList.remove('activo'); 
        Return; 
    }

    TimeoutBusqueda = setTimeout(async () => {
        Let resultadosHtml = '';

        If (puntosLocalesCalles && puntosLocalesCalles.length > 0) {
            Const limpiarTexto = (txt) => txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            Const queryLimia = limpiarTexto(query);
            Const palabrasQuery = queryLimia.split(' ').filter(p => p.length > 0);

            Let filtradosLocales = puntosLocalesCalles.filter(p => {
                Let nombreLugar = limpiarTexto(p.nombre);
                Let zonaLugar = limpiarTexto(p.zona || '');
                Let textoCompleto = nombreLugar + ' ' + zonaLugar;

                Return palabrasQuery.every(palabra => textoCompleto.includes(palabra));
            }).slice(0, 4);

            FiltradosLocales.forEach(lugar => {
                ResultadosHtml += `
                    <div class="sugerencia-item" onclick="seleccionarDestinoLocal('${lugar.nombre.replace(/'/g, "")}', ${lugar.lat}, ${lugar.lng})">
                        <strong>📍 ${lugar.nombre}</strong>
                        <div style="font-size:0.7rem; color:var(--color-primario);">Zona: ${lugar.zona || 'Local'}</div>
                    </div>
                `;
            });
        }

        Try {
            Const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Buenos Aires')}&limit=4`;
            Const res = await fetch(url); 
            Const datosGeo = await res.json();
            
            DatosGeo.forEach(lugar => {
                Let nombreCorto = lugar.display_name.split(',')[0];
                Let resto = lugar.display_name.split(',').slice(1,3).join(',');
                ResultadosHtml += `
                    <div class="sugerencia-item" onclick="seleccionarDestino('${lugar.display_name.replace(/'/g, "")}', ${lugar.lat}, ${lugar.lon})">
                        <strong>🎯 ${nombreCorto}</strong>
                        <div style="font-size:0.7rem; color:var(--texto-secundario);">${resto}</div>
                    </div>
                `;
            });
        } catch (e) {}

        Const contenedorSugerencias = document.getElementById('sugerencias');
        If (resultadosHtml) {
            ContenedorSugerencias.innerHTML = resultadosHtml;
            ContenedorSugerencias.classList.add('activo');
        } else {
            ContenedorSugerencias.classList.remove('activo');
        }
    }, 300);
}

Function seleccionarDestinoLocal(nombre, lat, lng) {
    Document.getElementById('destino').value = nombre;
    Document.getElementById('sugerencias').classList.remove('activo');
    DestinoCoords = { lat: parseFloat(lat), lng: parseFloat(lng) };
    If (markerDestino) mapa.removeLayer(markerDestino);
    MarkerDestino = L.marker([lat, lng], { icon: L.divIcon({ className: 'destino-ping-icon' }) }).addTo(mapa);
    RecalcularRutaYPrecio();
}

Function seleccionarDestino(direccion, lat, lng) {
    Document.getElementById('destino').value = direccion.split(',')[0];
    Document.getElementById('sugerencias').classList.remove('activo');
    DestinoCoords = { lat: parseFloat(lat), lng: parseFloat(lng) };
    If (markerDestino) mapa.removeLayer(markerDestino);
    MarkerDestino = L.marker([lat, lng], { icon: L.divIcon({ className: 'destino-ping-icon' }) }).addTo(mapa);
    RecalcularRutaYPrecio();
}

// ==========================================================
// NUEVO: BUSCADOR INTELIGENTE PARA EL ORIGEN PERSONALIZADO
// ==========================================================
Let timeoutBusquedaOrigen = null;
Function buscarOrigen(query) {
    ClearTimeout(timeoutBusquedaOrigen);
    If (query.length < 2) { 
        Document.getElementById('sugerenciasOrigen').classList.remove('activo'); 
        Return; 
    }

    TimeoutBusquedaOrigen = setTimeout(async () => {
        Let resultadosHtml = '';

        If (puntosLocalesCalles && puntosLocalesCalles.length > 0) {
            Const limpiarTexto = (txt) => txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            Const queryLimia = limpiarTexto(query);
            Const palabrasQuery = queryLimia.split(' ').filter(p => p.length > 0);

            Let filtradosLocales = puntosLocalesCalles.filter(p => {
                Let nombreLugar = limpiarTexto(p.nombre);
                Let zonaLugar = limpiarTexto(p.zona || '');
                Let textoCompleto = nombreLugar + ' ' + zonaLugar;
                Return palabrasQuery.every(palabra => textoCompleto.includes(palabra));
            }).slice(0, 4);

            FiltradosLocales.forEach(lugar => {
                ResultadosHtml += `
                    <div class="sugerencia-item" onclick="seleccionarOrigenLocal('${lugar.nombre.replace(/'/g, "")}', ${lugar.lat}, ${lugar.lng})">
                        <strong>📍 ${lugar.nombre}</strong>
                        <div style="font-size:0.7rem; color:var(--color-primario);">Zona: ${lugar.zona || 'Local'}</div>
                    </div>
                `;
            });
        }

        Try {
            Const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Buenos Aires')}&limit=4`;
            Const res = await fetch(url); 
            Const datosGeo = await res.json();
            
            DatosGeo.forEach(lugar => {
                Let nombreCorto = lugar.display_name.split(',')[0];
                Let resto = lugar.display_name.split(',').slice(1,3).join(',');
                ResultadosHtml += `
                    <div class="sugerencia-item" onclick="seleccionarOrigen('${lugar.display_name.replace(/'/g, "")}', ${lugar.lat}, ${lugar.lon})">
                        <strong>🎯 ${nombreCorto}</strong>
                        <div style="font-size:0.7rem; color:var(--texto-secundario);">${resto}</div>
                    </div>
                `;
            });
        } catch (e) {}

        Const contenedorSugerencias = document.getElementById('sugerenciasOrigen');
        If (resultadosHtml) {
            ContenedorSugerencias.innerHTML = resultadosHtml;
            ContenedorSugerencias.classList.add('activo');
        } else {
            ContenedorSugerencias.classList.remove('activo');
        }
    }, 300);
}

Function seleccionarOrigenLocal(nombre, lat, lng) {
    OrigenManualSeleccionado = true;
    If (watchIdPasajero !== null) {
        Navigator.geolocation.clearWatch(watchIdPasajero);
        WatchIdPasajero = null;
    }
    Document.getElementById('origenDisplay').value = nombre;
    Document.getElementById('sugerenciasOrigen').classList.remove('activo');
    MarcarOrigen(parseFloat(lat), parseFloat(lng), nombre);
    Mapa.setView([lat, lng], 16);
}

Function seleccionarOrigen(direccion, lat, lng) {
    OrigenManualSeleccionado = true;
    If (watchIdPasajero !== null) {
        Navigator.geolocation.clearWatch(watchIdPasajero);
        WatchIdPasajero = null;
    }
    Let nombreCorto = direccion.split(',')[0];
    Document.getElementById('origenDisplay').value = nombreCorto;
    Document.getElementById('sugerenciasOrigen').classList.remove('activo');
    MarcarOrigen(parseFloat(lat), parseFloat(lng), nombreCorto);
    Mapa.setView([lat, lng], 16);
}

Async function solicitarViaje() {
    Const destinoTexto = document.getElementById('destino').value.trim();
    If (!destinoTexto || !origenCoords || !destinoCoords) { mostrarMsg('Seleccioná un destino válido.', 'error'); return; }

    Try {
        Let precioFinalACobrar = precioCalculado;
        Let esDescuentoFidelidad = false;

        If (pasajeroTelefono) {
            Const { data: viajesPrevios, error: errHistorial } = await supabaseClient
                .from('viajes')
                .select('*')
                .eq('pasajero_telefono', pasajeroTelefono)
                .in('estado', ['finalizado', 'completado']);

            If (!errHistorial) {
                Let totalViajesPrevios = viajesPrevios ? viajesPrevios.length : 0;
                Let numeroDeEsteViaje = totalViajesPrevios + 1;

                If (numeroDeEsteViaje % 6 === 0) {
                    If (distanciaKm <= 12) {
                        PrecioFinalACobrar = Math.round(precioCalculado / 2);
                        EsDescuentoFidelidad = true;
                    } else {
                        MostrarMsg('⚠️ Tu 6to viaje supera los 12 km permitidos para la promo. Se aplicará la tarifa normal.', 'error');
                    }
                }
            }
        }

        Const { data, error } = await supabaseClient
            .from('viajes')
            .insert({
                Estado: 'pendiente',
                Pasajero_nombre: pasajeroNombre || "Pasajero",
                Pasajero_telefono: pasajeroTelefono || "Sin teléfono",
                Pasajero_foto: pasajeroBase64Foto || "",
                Tipo_vehiculo: tipoVehiculoSeleccionado,
                Origen_lat: origenCoords.lat,
                Origen_lng: origenCoords.lng,
                Destino_lat: destinoCoords.lat,
                Destino_lng: destinoCoords.lng,
                Precio: precioFinalACobrar,
                Distancia_km: distanciaKm
            }).select().single();

        If (error) throw error;
        ViajeId = data.id;
        LocalStorage.setItem('pasajero_viaje_id', data.id);
        
        Const avisoEspera = document.getElementById('avisoFidelidadEspera');
        Const avisoAsignado = document.getElementById('avisoFidelidadAsignado');
        
        If (esDescuentoFidelidad) {
            If (avisoEspera) avisoEspera.classList.remove('hidden');
            If (avisoAsignado) avisoAsignado.classList.remove('hidden');
        } else {
            If (avisoEspera) avisoEspera.classList.add('hidden');
            If (avisoAsignado) avisoAsignado.classList.add('hidden');
        }

        MostrarPaso('pasoEsperando');
        IniciarEscuchaRealtime(viajeId);
    } catch (e) { mostrarMsg('Error al solicitar: ' + e.message, 'error'); }
}

Async function cancelarViaje() { 
    If(viajeId) { 
        Await supabaseClient.from('viajes').update({ estado: 'cancelado' }).eq('id', viajeId); 
    } 
    LimpiarMemoriaPasajero(); 
    Location.reload(); 
}

Function volverAtras() { cancelarViaje(); }

Function mostrarPaso(id) { 
    ['pasoDatos', 'pasoEsperando', 'pasoPrecio'].forEach(p => document.getElementById(p).classList.add('hidden')); 
    Document.getElementById(id).classList.remove('hidden'); 
    
    Const panel = document.getElementById('bottomPanel');
    If (id === 'pasoPrecio') {
        Panel.classList.add('modo-compacto');
        Panel.classList.remove('con-ruta');
    } else {
        Panel.classList.remove('modo-compacto');
    }
}

Function mostrarMsg(texto, tipo) { 
    Const msg = document.getElementById('msg'); 
    Msg.textContent = texto; 
    Msg.className = 'msg msg-' + tipo + ' show'; 
    SetTimeout(() => {
        If(!texto.includes('6to viaje')) {
            Msg.classList.remove('show');
        }
    }, 8000); 
}

Window.addEventListener('DOMContentLoaded', () => { initMapa(); procesarSplashDeBienvenida(); });
