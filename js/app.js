/* ==========================================================================
 * CONFIGURACIÓN & ESTADO GLOBAL (PASAJERO)
 * ========================================================================== */
const SUPABASE_URL = 'https://hinqiuvbwygqhbabvxrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpbnFpdXZid3lncWhiYWJ2eHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODIyMzIsImV4cCI6MjA5NTA1ODIzMn0.wdnO33BVRtJ9-va3iqiAdWCttkAzpL5K1-b4vtyDvJA';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TARIFAS_DEFAULT = {
    base: 3500,
    km: 800,
    recargo: 1.30,
    horaInicio: 20,
    horaFin: 8
};

let tarifasActivas = { ...TARIFAS_DEFAULT };
const UBICACION_DEFAULT = [-34.54291, -58.71212];

let viajeId = null;
let subViaje = null;
let origenCoords = null;
let destinoCoords = null;
let precioCalculado = 0;
let distanciaKm = 0;
let modoDestinoManual = false;
let tipoVehiculoSeleccionado = 'auto';

let mapa = null;
let markerOrigen = null;
let markerDestino = null;
let markerConductor = null;
let rutaTrazada = null;

let pasajeroNombre = "";
let pasajeroTelefono = "";
let pasajeroBase64Foto = "";

let intervaloActualizacionRuta = null;
let canalChatPasajeroSupabase = null;
let puntosLocalesCalles = []; 

let intervaloTimbreInsistente = null;
let audioCtxPasajero = null;
let intervaloAlertaChatPasajero = null;
let watchIdPasajero = null; 
let usuarioMoviendoMapa = false;

let marcadoresChoferesDisponibles = {};
let canalChoferesCercanos = null;
let audioLlegadaReproducido = false;
let timeoutBusqueda = null;
