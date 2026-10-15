Const SUPABASE_URL = 'https://hinqiuvbwygqhbabvxrc.supabase.co';
Const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpbnFpdXZid3lncWhiYWJ2eHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODIyMzIsImV4cCI6MjA5NTA1ODIzMn0.wdnO33BVRtJ9-va3iqiAdWCttkAzpL5K1-b4vtyDvJA';
Const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

Let NOMBRE_CHOFER = localStorage.getItem('cfg_auto_chofer') || "";
Let FOTO_CHOFER = localStorage.getItem('cfg_auto_foto') || "https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg";
Let AUTO_CHOFER = (localStorage.getItem('cfg_auto_modelo') || "") + " - " + (localStorage.getItem('cfg_auto_color') || "") + " (Patente: " + (localStorage.getItem('cfg_auto_patente') || "") + ")";

Let totalDia = parseFloat(localStorage.getItem('chofer_total_dia') || '0');
Let ultimoViajeMonto = parseFloat(localStorage.getItem('chofer_ultimo_monto') || '0');
Let cantViajesCount = parseInt(localStorage.getItem('chofer_cant_viajes') || '0');

Function verificarReseteoDiario() {
    Const hoy = new Date().toLocaleDateString();
    Const ultimaFecha = localStorage.getItem('chofer_fecha_actual');

    If (ultimaFecha !== hoy) {
        TotalDia = 0;
        CantViajesCount = 0;
        LocalStorage.setItem('chofer_total_dia', '0');
        LocalStorage.setItem('chofer_cant_viajes', '0');
        LocalStorage.setItem('chofer_fecha_actual', hoy);
    }
}

Function actualizarUIEstadisticas() {
    Document.getElementById('lblTotalDia').textContent = '$' + totalDia.toLocaleString('es-AR');
    Document.getElementById('lblUltimoViaje').textContent = '$' + ultimoViajeMonto.toLocaleString('es-AR');
    Document.getElementById('lblCantViajes').textContent = cantViajesCount;
}

Let canalSupabase = null;
Let canalChatSupabase = null;
Let estaConectado = true; 
Let wakeLock = null; 
Let idRastreadorGps = null; 
Let autocentrarMapa = true;  

Let audioCtx = null;
Let intervaloCampana = null;
Let base64FotoTemp = "";
Let silentAudioInterval = null;

Function mantenerActivoSegundoPlano() {
    If (silentAudioInterval) return;
    SilentAudioInterval = setInterval(() => {
        If (!estaConectado) return;
        ForzarHabilitacionAudio();
        If (audioCtx) {
            Try {
                Let osc = audioCtx.createOscillator();
                Let gain = audioCtx.createGain();
                Gain.gain.setValueAtTime(0.00001, audioCtx.currentTime);
                Osc.connect(gain);
                Gain.connect(audioCtx.destination);
                Osc.start();
                Osc.stop(audioCtx.currentTime + 0.1);
            } catch(e){}
        }
        BuscarViajesPendientesRecientes();
    }, 15000);
}

Function verificarRegistroChofer() {
    If (!localStorage.getItem('cfg_auto_chofer') || !localStorage.getItem('cfg_auto_patente')) {
        Document.getElementById('modalConfigChofer').classList.remove('hidden');
    } else {
        Document.getElementById('inpNombre').value = localStorage.getItem('cfg_auto_chofer') || '';
        Document.getElementById('inpTelefono').value = localStorage.getItem('cfg_auto_telefono') || '';
        Document.getElementById('inpModelo').value = localStorage.getItem('cfg_auto_modelo') || '';
        Document.getElementById('inpColor').value = localStorage.getItem('cfg_auto_color') || '';
        Document.getElementById('inpPatente').value = localStorage.getItem('cfg_auto_patente') || '';
        If(localStorage.getItem('cfg_auto_foto')) {
            Document.getElementById('imgPreview').src = localStorage.getItem('cfg_auto_foto');
            Base64FotoTemp = localStorage.getItem('cfg_auto_foto');
        }
    }
}

Function procesarYComprimirFoto(event) {
    Const archivo = event.target.files[0];
    If (!archivo) return;

    If (!archivo.type.startsWith('image/')) {
        Alert('Por favor selecciona un archivo de imagen válido.');
        Return;
    }

    Const lector = new FileReader();
    Lector.onload = function(e) {
        Const img = new Image();
        Img.src = e.target.result;
        Img.onload = function() {
            Try {
                Const canvas = document.createElement('canvas');
                Const ctx = canvas.getContext('2d');
                
                Canvas.width = 300;
                Canvas.height = 300;

                Let sourceSize = Math.min(img.width, img.height);
                Let sourceX = (img.width - sourceSize) / 2;
                Let sourceY = (img.height - sourceSize) / 2;

                Ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 300, 300);

                Base64FotoTemp = canvas.toDataURL('image/jpeg', 0.8);
                Document.getElementById('imgPreview').src = base64FotoTemp;
            } catch (err) {
                Console.error("Error procesando foto:", err);
                Alert("La foto es demasiado grande. Intenta tomar otra.");
            }
        }
    }
    Lector.readAsDataURL(archivo);
}

Async function guardarConfigChofer(e) {
    E.preventDefault();
    Const nombre = document.getElementById('inpNombre').value.trim();
    Const telefono = document.getElementById('inpTelefono').value.trim();
    Const modelo = document.getElementById('inpModelo').value.trim();
    Const color = document.getElementById('inpColor').value.trim();
    Const patente = document.getElementById('inpPatente').value.trim();
    Const fotoFinal = base64FotoTemp || "https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg";

    LocalStorage.setItem('cfg_auto_chofer', nombre);
    LocalStorage.setItem('cfg_auto_telefono', telefono);
    LocalStorage.setItem('cfg_auto_modelo', modelo);
    LocalStorage.setItem('cfg_auto_color', color);
    LocalStorage.setItem('cfg_auto_patente', patente);
    LocalStorage.setItem('cfg_auto_foto', fotoFinal);

    Try {
        Await supabaseClient
            .from('conductores')
            .upsert({
                Nombre: nombre,
                Telefono: telefono,
                Modelo: `${modelo} - ${color}`,
                Patente: patente,
                Foto: fotoFinal,
                Aprobado: false, 
                Lat: choferCoords ? choferCoords.lat : null,
                Lng: choferCoords ? choferCoords.lng : null
            }, { onConflict: 'patente' });
            
        Alert("¡Registro exitoso! Tu cuenta ha sido enviada al Administrador para su aprobación. Podrás operar una vez que sea aprobada.");
    } catch (err) {
        Console.error("Error al sincronizar con la tabla conductores:", err);
    }

    Document.getElementById('modalConfigChofer').classList.add('hidden');
    Location.reload();
}

Function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
    Const R = 6371; 
    Const dLat = (lat2 - lat1) * Math.PI / 180;
    Const dLon = (lon2 - lon1) * Math.PI / 180;
    Const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    Return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

Async function obtenerDireccionYBarrio(lat, lon) {
    Try {
        Let res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
            Headers: { 'Accept-Language': 'es' }
        });
        Let data = await res.json();
        If (data && data.address) {
            Let calle = data.address.road || data.address.pedestrian || data.address.suburb || "Calle sin nombre";
            Let numero = data.address.house_number ? ` ${data.address.house_number}` : "";
            Let barrio = data.address.neighbourhood || data.address.suburb || data.address.city_district || data.address.town || data.address.city || "Zona general";
            Return {
                CalleCompleta: `${calle}${numero}`.trim(),
                Barrio: barrio
            };
        }
    } catch (e) {}
    Return { calleCompleta: "Punto exacto", barrio: "Zona general" };
}

Async function solicitarWakeLock() {
    If (!('wakeLock' in navigator)) return;
    Try { if (!wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
}
Function liberarWakeLock() { if (wakeLock) { wakeLock.release(); wakeLock = null; } }

Async function pedirPermisoNotificaciones() {
    If ('Notification' in window) {
        Let permiso = Notification.permission;
        If (permiso === 'default') {
            Permiso = await Notification.requestPermission();
        }
        Return permiso === 'granted';
    }
    Return false;
}

Function forzarHabilitacionAudio() {
    If (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    else if (audioCtx.state === 'suspended') audioCtx.resume();
}

Function tocarUnRepiqueDeCampana() {
    If (!audioCtx) return;
    Try {
        Let osc = audioCtx.createOscillator();
        Let gainNode = audioCtx.createGain();
        Osc.type = 'sine'; osc.frequency.setValueAtTime(1475, audioCtx.currentTime); 
        GainNode.gain.setValueAtTime(0.9, audioCtx.currentTime);
        GainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
        Osc.connect(gainNode); gainNode.connect(audioCtx.destination);
        Osc.start(); osc.stop(audioCtx.currentTime + 0.8);
    } catch(e) {}
}

Function saludarConductorBienvenida(nombrePasajero) {
    If ('speechSynthesis' in window) {
        Window.speechSynthesis.cancel();
        
        Const texto = nombrePasajero 
            ? `Hola ${nombrePasajero}, bienvenido a Tu Móvil. En camino hacia tu destino.` 
            : `Hola, bienvenido a Tu Móvil. En camino hacia tu destino.`;

        Const enunciado = new SpeechSynthesisUtterance(texto);
        Enunciado.lang = 'es-AR';
        Enunciado.rate = 0.95; 
        Enunciado.pitch = 1.0;  

        Const voces = window.speechSynthesis.getVoices();
        Const vozElegida = voces.find(v => 
            V.lang.includes('es') && (
                V.name.toLowerCase().includes('google') || 
                V.name.toLowerCase().includes('es-')
            )
        ) || voces.find(v => v.lang.startsWith('es'));

        If (vozElegida) {
            Enunciado.voice = vozElegida;
        }

        Window.speechSynthesis.speak(enunciado);
    }
}

If ('speechSynthesis' in window) {
    Window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
}

Function comenzarSirenaAlerta() {
    If (intervaloCampana) return;
    ForzarHabilitacionAudio();
    IntervaloCampana = setInterval(() => { tocarUnRepiqueDeCampana(); }, 500);
}
Function detenerSirenaAlerta() {
    If (intervaloCampana) { clearInterval(intervaloCampana); intervaloCampana = null; }
}

Function probarCampanaManual(e) {
    E.stopPropagation();
    ForzarHabilitacionAudio();
    TocarUnRepiqueDeCampana();
    Const btn = document.getElementById('btnTestSonido');
    Btn.textContent = "🔔 ¡Sonando Ok!";
    Btn.style.background = "#15803d";
    setTimeout(() => { btn.textContent = "🔊 Probar Timbre"; btn.style.background = "#c2410c"; }, 2000);
}

Const ESTACION_SAN_MIGUEL = [-34.54291, -58.71212];
Let mapa = null, markerChofer = null, markerOrigen = null, markerDestino = null, rutaTrazada = null;
Let choferCoords = { lat: -34.545, lng: -58.715 }; 
Let viajeActivo = null;
Let estadoFlujo = 'pendiente'; 

Function initMapa() {
    Mapa = L.map('mapaLeaflet', { zoomControl: false, attributionControl: false }).setView(ESTACION_SAN_MIGUEL, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
    
    Const iconoAuto = L.divIcon({ className: 'chofer-auto-icon', html: '🚗', iconSize: [38, 38], iconAnchor: [19, 19] });
    MarkerChofer = L.marker([choferCoords.lat, choferCoords.lng], { icon: iconoAuto }).addTo(mapa);

    Mapa.on('dragstart', () => {
        AutocentrarMapa = false;
        Document.getElementById('btnGpsCentro').classList.remove('seguimiento-on');
    });
}

Function iniciarRastreoGpsContinuo() {
    If (idRastreadorGps) return;
    If (navigator.geolocation) {
        IdRastreadorGps = navigator.geolocation.watchPosition(async (pos) => {
            Const nuevaLat = pos.coords.latitude;
            Const nuevaLng = pos.coords.longitude;
            ChoferCoords = { lat: nuevaLat, lng: nuevaLng };
            
            If (markerChofer) markerChofer.setLatLng([nuevaLat, nuevaLng]);

            If (autocentrarMapa) {
                Let zoomActual = (estadoFlujo !== 'pendiente' && viajeActivo) ? 17 : 15;
                Mapa.setView([nuevaLat, nuevaLng], zoomActual);
                Document.getElementById('btnGpsCentro').classList.add('seguimiento-on');
            }

            If (viajeActivo && viajeActivo.id) {
                Try {
                    Await supabaseClient.from('viajes').update({ conductor_lat: nuevaLat, conductor_lng: nuevaLng }).eq('id', viajeActivo.id);
                } catch (err) {}
            }

            Try {
                Let patenteLocal = localStorage.getItem('cfg_auto_patente');
                If (patenteLocal) {
                    Await supabaseClient.from('conductores').update({ lat: nuevaLat, lng: nuevaLng }).eq('patente', patenteLocal);
                }
            } catch(e) {}

            If (viajeActivo && (estadoFlujo === 'aceptado' || estadoFlujo === 'en_puerta')) {
                ActualizarRutaEnMovimiento(nuevaLat, nuevaLng, viajeActivo.origen_lat, viajeActivo.origen_lng);
            } else if (viajeActivo && estadoFlujo === 'en_viaje') {
                ActualizarRutaEnMovimiento(nuevaLat, nuevaLng, viajeActivo.destino_lat, viajeActivo.destino_lng);
            }
        }, (error) => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
    }
}

Function detenerRastreoGps() {
    If (idRastreadorGps) { navigator.geolocation.clearWatch(idRastreadorGps); idRastreadorGps = null; }
}

Function alternarSeguimientoManual() {
    AutocentrarMapa = true;
    Document.getElementById('btnGpsCentro').classList.add('seguimiento-on');
    Mapa.setView([choferCoords.lat, choferCoords.lng], (estadoFlujo !== 'pendiente' && viajeActivo) ? 17 : 15);
}

Function abrirNavegacionGoogleMaps() {
    If (!viajeActivo) { alert("Necesitás un viaje activo."); return; }
    Let destLat = (estadoFlujo === 'en_viaje') ? viajeActivo.destino_lat : viajeActivo.origen_lat;
    Let destLng = (estadoFlujo === 'en_viaje') ? viajeActivo.destino_lng : viajeActivo.origen_lng;
    Window.open(`https://www.google.com/maps/dir/?api=1&origin=${choferCoords.lat},${choferCoords.lng}&destination=${destLat},${destLng}&travelmode=driving`, '_blank');
}

Async function buscarViajesPendientesRecientes() {
    If (viajeActivo || !estaConectado) return;
    Try {
        Const { data: chofer } = await supabaseClient.from('conductores').select('aprobado').eq('patente', localStorage.getItem('cfg_auto_patente')).single();
        If (!chofer || chofer.aprobado !== true) return;

        Const { data: viajes, error } = await supabaseClient
            .from('viajes').select('*').eq('estado', 'pendiente').is('conductor_nombre', null)
            .order('created_at', { ascending: false }).limit(1);

        If (!error && viajes && viajes.length > 0) {
            Const viajeReciente = viajes[0];
            Const tiempoCreacion = new Date(viajeReciente.created_at).getTime();
            Const ahora = Date.now();
            If ((ahora - tiempoCreacion) < 60000) { 
                Const distanciaAlViaje = calcularDistanciaKm(choferCoords.lat, choferCoords.lng, viajeReciente.origen_lat, viajeReciente.origen_lng);
                If (distanciaAlViaje <= 5) { montarViajeEntrante(viajeReciente); }
            }
        }
    } catch (err) {}
}

Async function escucharNuevosViajes() {
    Let patenteLocal = localStorage.getItem('cfg_auto_patente');
    If (patenteLocal) {
        Try {
            Const { data: chofer } = await supabaseClient.from('conductores').select('aprobado').eq('patente', patenteLocal).single();
            If (!chofer || chofer.aprobado !== true) return;
        } catch (e) { return; }
    }

    If (canalSupabase) return;
    BuscarViajesPendientesRecientes();

    CanalSupabase = supabaseClient.channel('despacho-chofer');
    CanalSupabase
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'viajes' }, async (payload) => {
            Const { data: chofer } = await supabaseClient.from('conductores').select('aprobado').eq('patente', localStorage.getItem('cfg_auto_patente')).single();
            If (!chofer || chofer.aprobado !== true) return;

            If (payload.new.estado === 'pendiente' && !viajeActivo && estaConectado) {
                Const distanciaAlViaje = calcularDistanciaKm(choferCoords.lat, choferCoords.lng, payload.new.origen_lat, payload.new.origen_lng);
                If (distanciaAlViaje > 5) return;
                MontarViajeEntrante(payload.new);
            }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'viajes' }, (payload) => {
            If (viajeActivo && payload.new.id === viajeActivo.id && payload.new.estado === 'cancelado') {
                DetenerSirenaAlerta();
                MostrarMsg('El pasajero canceló el viaje.', 'success');
                LimpiarMemoriaConductor();
                setTimeout(() => location.reload(), 3000);
            }
        })
        .subscribe();
}

Function toggleChatFlotante() {
    Const modal = document.getElementById('modalChatFlotante');
    Modal.classList.toggle('activo');

    If (modal.classList.contains('activo')) {
        Const btnChat = document.getElementById('btnAbrirChatFlotante');
        If (btnChat) btnChat.classList.remove('chat-alerta-activo');
    }
}

Function iniciarChatViaje(viajeId) {
    CargarHistorialMensajes(viajeId);
    If (canalChatSupabase) supabaseClient.removeChannel(canalChatSupabase);

    CanalChatSupabase = supabaseClient.channel(`chat_viaje_${viajeId}`)
        .on('postgres_changes', {
            Event: 'INSERT',
            Schema: 'public',
            Table: 'mensajes',
            Filter: `viaje_id=eq.${viajeId}`
        }, payload => {
            AgregarMensajeAlDom(payload.new);

            Const modalChat = document.getElementById('modalChatFlotante');
            If (payload.new.emisor !== 'conductor' && !modalChat.classList.contains('activo')) {
                TocarUnRepiqueDeCampana();
                Const btnChat = document.getElementById('btnAbrirChatFlotante');
                If (btnChat) btnChat.classList.add('chat-alerta-activo');
            }
        })
        .subscribe();
}

Async function cargarHistorialMensajes(viajeId) {
    Try {
        Const { data, error } = await supabaseClient
            .from('mensajes')
            .select('*')
            .eq('viaje_id', viajeId)
            .order('created_at', { ascending: true });

        Const listaHtml = document.getElementById('listaMensajesChat');
        If (!listaHtml) return;
        ListaHtml.innerHTML = '';
        If (data && data.length > 0) {
            Data.forEach(msg => agregarMensajeAlDom(msg));
        } else {
            ListaHtml.innerHTML = '<div style="color: #86efac; text-align: center; font-size: 0.75rem;">No hay mensajes previos. Escribe algo...</div>';
        }
    } catch (e) {}
}

Function agregarMensajeAlDom(msg) {
    Const listaHtml = document.getElementById('listaMensajesChat');
    If (!listaHtml) return;

    If (listaHtml.innerHTML.includes('No hay mensajes previos')) {
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

Async function enviarMensajeChat() {
    Const input = document.getElementById('inpMensajeChat');
    Const texto = input.value.trim();
    If (!texto || !viajeActivo) return;

    Input.value = '';
    Try {
        Await supabaseClient.from('mensajes').insert([{
            Viaje_id: viajeActivo.id,
            Emisor: 'conductor',
            Mensaje: texto
        }]);
    } catch (e) {}
}

Async function conmutarEstadoConexion() {
    If (viajeActivo) return;

    Let patenteLocal = localStorage.getItem('cfg_auto_patente');
    If (patenteLocal) {
        Try {
            Const { data: chofer, error } = await supabaseClient
                .from('conductores')
                .select('aprobado')
                .eq('patente', patenteLocal)
                .single();

            If (error || !chofer || chofer.aprobado !== true) {
                Alert("⏳ Tu cuenta aún está pendiente de aprobación por el Administrador. Por favor espera a que te den el alta para empezar a operar.");
                Return;
            }
        } catch(e) {
            Alert("No se pudo verificar el estado de aprobación con el servidor.");
            Return;
        }
    }

    EstaConectado = !estaConectado;
    Const badge = document.getElementById('txtEstadoChofer');
    Const btnEspera = document.getElementById('btnEstadoEsperaTexto');

    If (estaConectado) {
        Badge.textContent = "Móvil en Línea 🟢"; badge.className = "status-badge activo";
        BtnEspera.innerHTML = `<div class="ruedita-radar"></div>Buscando solicitudes (5 km)...`; 
        BtnEspera.className = "btn-action btn-espera";
        
        PedirPermisoNotificaciones().then(tienePermiso => {
            If (tienePermiso && navigator.serviceWorker.controller) {
                Navigator.serviceWorker.controller.postMessage({ action: 'mostrarNotificacionFija' });
            }
        });

        SolicitarWakeLock(); iniciarRastreoGpsContinuo(); escucharNuevosViajes();
        MantenerActivoSegundoPlano();
        BuscarViajesPendientesRecientes();
    } else {
        Badge.textContent = "Fuera de Línea 🔴"; badge.className = "status-badge inactivo";
        BtnEspera.textContent = "Turno Pausado"; btnEspera.className = "btn-action btn-desconectado";
        
        If (navigator.serviceWorker.controller) {
            Navigator.serviceWorker.controller.postMessage({ action: 'cerrarNotificacionFija' });
        }

        LiberarWakeLock(); detenerRastreoGps(); 
        If(silentAudioInterval) { clearInterval(silentAudioInterval); silentAudioInterval = null; }
        If(canalSupabase) { supabaseClient.removeChannel(canalSupabase); canalSupabase = null; }
    }
}

Async function montarViajeEntrante(viaje) {
    ViajeActivo = viaje;
    EstadoFlujo = 'pendiente';
    ComenzarSirenaAlerta();

    Document.getElementById('vistaEspera').classList.add('hidden');
    Document.getElementById('vistaViaje').classList.remove('hidden');
    
    If (mapa) {
        setTimeout(() => { mapa.invalidateSize(); }, 200);
    }

    Const panel = document.getElementById('panelConductor');
    Panel.classList.remove('viaje-activo-estado');
    Panel.classList.add('viaje-entrante');

    Let origenInfo = await obtenerDireccionYBarrio(viaje.origen_lat, viaje.origen_lng);
    Let destinoInfo = await obtenerDireccionYBarrio(viaje.destino_lat, viaje.destino_lng);

    Let barrioOrigen = viaje.origen_barrio || origenInfo.barrio;
    Let calleOrigen = viaje.origen_direccion || origenInfo.calleCompleta;
    Let barrioDestino = viaje.destino_barrio || destinoInfo.barrio;
    Let calleDestino = viaje.destino_direccion || destinoInfo.calleCompleta;
    
    Let textoManifiesto = viaje.manifiesto || viaje.comentarios || viaje.nota || "";
    Let manifiestoHtml = '';
    If (textoManifiesto && textoManifiesto.trim() !== "" && textoManifiesto !== "Sin especificaciones adicionales de carga") {
        ManifiestoHtml = `<div class="manifesto-box">📋 <b>Manifiesto / Info:</b> ${textoManifiesto}</div>`;
    }

    Let avisoFidelidadHtml = '';
    If (viaje.es_fidelidad === true) {
        AvisoFidelidadHtml = `
            <div style="background: #143621; border: 2px solid #22c55e; padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                <h4 style="color: #4ade80; margin: 0 0 4px 0; font-size: 0.9rem;">🎁 ¡Viaje Promocional / Cupón Solidario!</h4>
                <p style="color: #86efac; font-size: 0.8rem; margin: 0;">50% de descuento aplicado (Fidelidad).</p>
            </div>
        `;
    }

    Const contenedorViaje = document.getElementById('contenedorViajeEntrante');
    ContenedorViaje.innerHTML = `
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

    If (markerOrigen) mapa.removeLayer(markerOrigen);
    If (markerDestino) mapa.removeLayer(markerDestino);

    MarkerOrigen = L.marker([viaje.origen_lat, viaje.origen_lng], { icon: L.divIcon({ className: 'pasajero-origen-icon' }) }).addTo(mapa);
    MarkerDestino = L.marker([viaje.destino_lat, viaje.destino_lng], { icon: L.divIcon({ className: 'pasajero-destino-icon' }) }).addTo(mapa);

    AutocentrarMapa = true; 
    Await trazarRutaCallesYCalcularMetricas(choferCoords.lat, choferCoords.lng, viaje.origen_lat, viaje.origen_lng, viaje.destino_lat, viaje.destino_lng);
}

Function rechazarViajeEntrante() {
    DetenerSirenaAlerta();
    LimpiarMemoriaConductor();

    If (markerOrigen) { mapa.removeLayer(markerOrigen); markerOrigen = null; }
    If (markerDestino) { mapa.removeLayer(markerDestino); markerDestino = null; }
    If (rutaTrazada) { mapa.removeLayer(rutaTrazada); rutaTrazada = null; }

    ViajeActivo = null; estadoFlujo = 'pendiente';
    Document.getElementById('vistaViaje').classList.add('hidden');
    Document.getElementById('vistaEspera').classList.remove('hidden');
    
    Const panel = document.getElementById('panelConductor');
    Panel.classList.remove('viaje-entrante');
    Panel.classList.remove('viaje-activo-estado');
    
    If(canalChatSupabase) { supabaseClient.removeChannel(canalChatSupabase); canalChatSupabase = null; }
    Document.getElementById('btnAbrirChatFlotante').style.display = 'none';

    MostrarMsg('Viaje rechazado. Buscando nuevos pasajeros...', 'success');
}

Async function procesarLojicaViaje() {
    Const panel = document.getElementById('panelConductor');

    If (estadoFlujo === 'pendiente') {
        DetenerSirenaAlerta();
        Try {
            Const { error } = await supabaseClient.from('viajes').update({ 
                Conductor_nombre: NOMBRE_CHOFER, 
                Conductor_auto: AUTO_CHOFER,
                Conductor_foto: FOTO_CHOFER 
            }).eq('id', viajeActivo.id);
            If (error) throw error;
            
            EstadoFlujo = 'aceptado';
            LocalStorage.setItem('conductor_viaje_id', viajeActivo.id);
            LocalStorage.setItem('conductor_estado_flujo', 'aceptado');
            
            Panel.classList.remove('viaje-entrante');
            Panel.classList.add('viaje-activo-estado');
            
            Const btnContenedorPendiente = document.getElementById('contenedorBotonesPendiente');
            If(btnContenedorPendiente) btnContenedorPendiente.classList.add('hidden');
            
            Const btnEnCurso = document.getElementById('btnAccionEnCurso');
            BtnEnCurso.classList.remove('hidden');
            BtnEnCurso.className = "btn-action btn-llegué"; 
            BtnEnCurso.textContent = "Ya llegué a la puerta 🔓";

            Document.getElementById('txtEstadoChofer').textContent = "Yendo al Pasajero 🚗";

            IniciarChatViaje(viajeActivo.id);
            Document.getElementById('btnAbrirChatFlotante').style.display = 'flex';

            AutocentrarMapa = true;
            Document.getElementById('btnGpsCentro').classList.add('seguimiento-on');
            Mapa.setView([choferCoords.lat, choferCoords.lng], 17);
        } catch (e) { location.reload(); }
        return;
    }

    Const btnEnCurso = document.getElementById('btnAccionEnCurso');
    If (estadoFlujo === 'aceptado') {
        EstadoFlujo = 'en_puerta'; localStorage.setItem('conductor_estado_flujo', 'en_puerta');
        BtnEnCurso.className = "btn-action btn-iniciar"; btnEnCurso.textContent = "Iniciar Viaje al Destino 🧭";
        Document.getElementById('txtEstadoChofer').textContent = "En la Puerta 📍";
        Await supabaseClient.from('viajes').update({ estado: 'aceptado' }).eq('id', viajeActivo.id);
        Return;
    }
    If (estadoFlujo === 'en_puerta') {
        EstadoFlujo = 'en_viaje'; localStorage.setItem('conductor_estado_flujo', 'en_viaje');
        
        SaludarConductorBienvenida(viajeActivo.pasajero_nombre);

        BtnEnCurso.className = "btn-action btn-finalizar"; 
        BtnEnCurso.textContent = "Finalizar Viaje y Cobrar 💵";
        Document.getElementById('txtEstadoChofer').textContent = "Viajando al Destino 🧭";
        
        Await supabaseClient.from('viajes').update({ estado: 'en_viaje' }).eq('id', viajeActivo.id);
        
        Let destinoInfo = await obtenerDireccionYBarrio(viajeActivo.destino_lat, viajeActivo.destino_lng);
        Let barrioDestino = viajeActivo.destino_barrio || destinoInfo.barrio;
        Let calleDestino = viajeActivo.destino_direccion || destinoInfo.calleCompleta;

        Let textoManifiesto = viajeActivo.manifiesto || viajeActivo.comentarios || viajeActivo.nota || "";
        Let manifiestoHtml = '';
        If (textoManifiesto && textoManifiesto.trim() !== "" && textoManifiesto !== "Sin especificaciones adicionales de carga") {
            ManifiestoHtml = `<div class="manifesto-box">📋 <b>Manifiesto / Info:</b> ${textoManifiesto}</div>`;
        }

        Let avisoFidelidadHtml = '';
        If (viajeActivo.es_fidelidad === true) {
            AvisoFidelidadHtml = `
                <div style="background: #143621; border: 2px solid #22c55e; padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                    <h4 style="color: #4ade80; margin: 0 0 4px 0; font-size: 0.9rem;">🎁 ¡Viaje Promocional / Cupón Solidario!</h4>
                    <p style="color: #86efac; font-size: 0.8rem; margin: 0;">50% de descuento aplicado (Fidelidad).</p>
                </div>
            `;
        }

        Const contenedorViaje = document.getElementById('contenedorViajeEntrante');
        ContenedorViaje.innerHTML = `
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
                        <div style="border-top:1px solid #166534; margin-top:3px; padding-top:4px;" id="cajaMetricasRuta">
                            <span>🕒 Calculando viaje...</span>
                        </div>
                        ${manifiestoHtml}
                    </div>
                </div>
            </div>
            <button class="btn-action btn-finalizar" id="btnAccionEnCurso" onclick="procesarLojicaViaje()">Finalizar Viaje y Cobrar 💵</button>
        `;

        Await trazarRutaCallesYCalcularMetricas(viajeActivo.origen_lat, viajeActivo.origen_lng, viajeActivo.destino_lat, viajeActivo.destino_lng, null, null);
        
        AutocentrarMapa = true;
        Document.getElementById('btnGpsCentro').classList.add('seguimiento-on');
        Return;
    }
    If (estadoFlujo === 'en_viaje') {
        Let montoViaje = parseFloat(viajeActivo.precio || '0');
        TotalDia += montoViaje;
        UltimoViajeMonto = montoViaje;
        CantViajesCount += 1;

        LocalStorage.setItem('chofer_total_dia', totalDia);
        LocalStorage.setItem('chofer_ultimo_monto', ultimoViajeMonto);
        LocalStorage.setItem('chofer_cant_viajes', cantViajesCount);
        ActualizarUIEstadisticas();

        Await supabaseClient.from('viajes').update({ estado: 'finalizado' }).eq('id', viajeActivo.id);
        LimpiarMemoriaConductor(); liberarWakeLock(); detenerRastreoGps();
        If(silentAudioInterval) { clearInterval(silentAudioInterval); silentAudioInterval = null; }
        If(canalChatSupabase) { supabaseClient.removeChannel(canalChatSupabase); }
        
        If (navigator.serviceWorker.controller) {
            Navigator.serviceWorker.controller.postMessage({ action: 'cerrarNotificacionFija' });
        }

        setTimeout(() => location.reload(), 2000);
    }
}

Async function verificarViajeActivoConductor() {
    Const guardadoId = localStorage.getItem('conductor_viaje_id');
    Const guardadoEstado = localStorage.getItem('conductor_estado_flujo');
    If (!guardadoId) return;
    Try {
        Const { data: viaje } = await supabaseClient.from('viajes').select('*').eq('id', guardadoId).single();
        If (!viaje || viaje.estado === 'finalizado' || viaje.estado === 'cancelado') { limpiarMemoriaConductor(); return; }
        ViajeActivo = viaje; estadoFlujo = guardadoEstado || 'aceptado';
        
        Document.getElementById('vistaEspera').classList.add('hidden');
        Document.getElementById('vistaViaje').classList.remove('hidden');

        Const panel = document.getElementById('panelConductor');
        Panel.classList.remove('viaje-entrante');
        Panel.classList.add('viaje-activo-estado');

        IniciarChatViaje(viaje.id);
        Document.getElementById('btnAbrirChatFlotante').style.display = 'flex';

        Let origenInfo = await obtenerDireccionYBarrio(viaje.origen_lat, viaje.origen_lng);
        Let destinoInfo = await obtenerDireccionYBarrio(viaje.destino_lat, viaje.destino_lng);
        Let barrioOrigen = viaje.origen_barrio || origenInfo.barrio;
        Let calleOrigen = viaje.origen_direccion || origenInfo.calleCompleta;
        Let barrioDestino = viaje.destino_barrio || destinoInfo.barrio;
        Let calleDestino = viaje.destino_direccion || destinoInfo.calleCompleta;

        Let textoManifiesto = viaje.manifiesto || viaje.comentarios || viaje.nota || "";
        Let manifiestoHtml = '';
        If (textoManifiesto && textoManifiesto.trim() !== "" && textoManifiesto !== "Sin especificaciones adicionales de carga") {
            ManifiestoHtml = `<div class="manifesto-box">📋 <b>Manifiesto / Info:</b> ${textoManifiesto}</div>`;
        }

        Let avisoFidelidadHtml = '';
        If (viaje.es_fidelidad === true) {
            AvisoFidelidadHtml = `
                <div style="background: #143621; border: 2px solid #22c55e; padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                    <h4 style="color: #4ade80; margin: 0 0 4px 0; font-size: 0.9rem;">🎁 ¡Viaje Promocional / Cupón Solidario!</h4>
                    <p style="color: #86efac; font-size: 0.8rem; margin: 0;">50% de descuento aplicado (Fidelidad).</p>
                </div>
            `;
        }

        MarkerOrigen = L.marker([viaje.origen_lat, viaje.origen_lng], { icon: L.divIcon({ className: 'pasajero-origen-icon' }) }).addTo(mapa);
        MarkerDestino = L.marker([viaje.destino_lat, viaje.destino_lng], { icon: L.divIcon({ className: 'pasajero-destino-icon' }) }).addTo(mapa);

        Const contenedorViaje = document.getElementById('contenedorViajeEntrante');
        
        If (estadoFlujo === 'aceptado') {
            ContenedorViaje.innerHTML = `
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
            Await trazarRutaCallesYCalcularMetricas(choferCoords.lat, choferCoords.lng, viaje.origen_lat, viaje.origen_lng, viaje.destino_lat, viaje.destino_lng);
        } else if (estadoFlujo === 'en_puerta') {
            ContenedorViaje.innerHTML = `
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
            Await trazarRutaCallesYCalcularMetricas(choferCoords.lat, choferCoords.lng, viaje.origen_lat, viaje.origen_lng, viaje.destino_lat, viaje.destino_lng);
        } else if (estadoFlujo === 'en_viaje') {
            ContenedorViaje.innerHTML = `
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
            Await trazarRutaCallesYCalcularMetricas(viaje.origen_lat, viaje.origen_lng, viaje.destino_lat, viaje.destino_lng, null, null);
        }
    } catch (e) { limpiarMemoriaConductor(); }
}

Function limpiarMemoriaConductor() { localStorage.removeItem('conductor_viaje_id'); localStorage.removeItem('conductor_estado_flujo'); }

Async function trazarRutaCallesYCalcularMetricas(lat1, lon1, lat2, lon2, latDestinoExtra = null, lonDestinoExtra = null) {
    Try {
        Let url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}`;
        If (latDestinoExtra && lonDestinoExtra) {
            Url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2};${lonDestinoExtra},${lonDestinoExtra}`;
        }
        Url += `?overview=full&geometries=geojson`;

        Const res = await fetch(url);
        Const data = await res.json();
        
        Let distanciaKm = 0;
        Let minutosEstimados = 0;
        Let rutaValida = false;

        If (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            Let distanciaMetros = data.routes[0].distance;
            Let duracionSegundos = data.routes[0].duration;

            DistanciaKm = (distanciaMetros / 1000);
            MinutosEstimados = Math.max(1, Math.round(duracionSegundos / 60));

            If (distanciaKm >= 0) {
                RutaValida = true;
                If (rutaTrazada) mapa.removeLayer(rutaTrazada);
                RutaTrazada = L.polyline(data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]), { color: '#22c55e', weight: 6, opacity: 0.9 }).addTo(mapa);
            }
        }

        If (!rutaValida) {
            If (rutaTrazada) mapa.removeLayer(rutaTrazada);
            Let puntosLinea = [[lat1, lon1], [lat2, lon2]];
            If (latDestinoExtra && lonDestinoExtra) {
                PuntosLinea = [[lat1, lon1], [lat2, lon2], [latDestinoExtra, lonDestinoExtra]];
            }
            RutaTrazada = L.polyline(puntosLinea, { color: '#22c55e', weight: 6, dashArray: '5, 5', opacity: 0.9 }).addTo(mapa);

            Let distanciaLineaMetros = calcularDistanciaKm(lat1, lon1, lat2, lon2) * 1000;
            DistanciaKm = (distanciaLineaMetros / 1000);
            MinutosEstimados = Math.max(1, Math.round((distanciaKm / 30) * 60));
        }

        Let cajaMetricas = document.getElementById('cajaMetricasRuta');
        If (cajaMetricas) {
            If (latDestinoExtra) {
                CajaMetricas.innerHTML = `<span>🕒 <b>${minutosEstimados} min</b> (${distanciaKm.toFixed(1)} km al pasajero)</span>`;
            } else {
                CajaMetricas.innerHTML = `<span>🕒 <b>${minutosEstimados} min</b> de viaje real (${distanciaKm.toFixed(1)} km)</span>`;
            }
        }
    } catch (e) {
        If (rutaTrazada) mapa.removeLayer(rutaTrazada);
        Let puntosError = [[lat1, lon1], [lat2, lon2]];
        If (latDestinoExtra && lonDestinoExtra) {
            PuntosError = [[lat1, lon1], [lat2, lon2], [latDestinoExtra, lonDestinoExtra]];
        }
        RutaTrazada = L.polyline(puntosError, { color: '#22c55e', weight: 6, dashArray: '5, 5', opacity: 0.9 }).addTo(mapa);
    }
}

Let ultimoCalculoRuta = 0;
Let ultimaLatRuta = 0;
Let ultimaLngRuta = 0;

Function distanciaEnMetros(lat1, lon1, lat2, lon2) {
    Let dLat = (lat2 - lat1) * Math.PI / 180;
    Let dLon = (lon2 - lon1) * Math.PI / 180;
    Let a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    Let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    Return 6371000 * c;
}

// ==========================================================
// ESTABILIZACIÓN DE RUTA EN MOVIMIENTO (EVITA SALTOS EN MAPA)
// ==========================================================
async function actualizarRutaEnMovimiento(lat1, lon1, lat2, lon2) {
    Let ahora = Date.now();
    // Exigimos que se mueva al menos 35 metros o pasen 12 segundos para actualizar la ruta de calles
    Let seDesvio = (ultimaLatRuta === 0) || (distanciaEnMetros(lat1, lon1, ultimaLatRuta, ultimaLngRuta) > 35);
    
    If ((ahora - ultimoCalculoRuta > 12000) || seDesvio) {
        UltimaLatRuta = lat1;
        UltimaLngRuta = lon1;
        Await trazarRutaCallesYCalcularMetricas(lat1, lon1, lat2, lon2, null, null);
        UltimoCalculoRuta = ahora;
    }
}

Function mostrarMsg(texto, tipo) { const msg = document.getElementById('msgChofer'); msg.textContent = texto; msg.className = 'msg msg-' + tipo + ' show'; setTimeout(() => msg.classList.remove('show'), 4000); }

Document.addEventListener('visibilitychange', async () => {
    If (document.visibilityState === 'visible' && estaConectado) {
        Await solicitarWakeLock();
        BuscarViajesPendientesRecientes();
    }
});

If ('serviceWorker' in navigator) {
    Window.addEventListener('load', () => {
        Navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registrado con éxito', reg))
            .catch(err => console.log('Error al registrar Service Worker', err));
    });
}

Window.addEventListener('DOMContentLoaded', () => {
    VerificarRegistroChofer();
    VerificarReseteoDiario();
    ActualizarUIEstadisticas();
    InitMapa(); 
    EscucharNuevosViajes(); 
    SolicitarWakeLock(); 
    IniciarRastreoGpsContinuo(); 
    MantenerActivoSegundoPlano();
    
    setTimeout(async () => { 
        Await verificarViajeActivoConductor(); 
        Await buscarViajesPendientesRecientes(); 
    }, 1000);
});
