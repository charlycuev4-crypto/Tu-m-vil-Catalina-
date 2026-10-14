// NUEVA FUNCIÓN DINÁMICA DE UN SOLO TOQUE PARA LA SELFIE
let streamCamaraPasajero = null;

async function tomarSelfieDirecta() {
    const video = document.getElementById('videoCamara');
    const contenedor = document.getElementById('contenedorCamara');
    const imgPrev = document.getElementById('imgPreview');
    const textoEstado = document.getElementById('siluetaOverlay');

    // Si la cámara ya está activa, este toque captura la foto automáticamente
    if (streamCamaraPasajero) {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 300;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, 300, 300);

        pasajeroBase64Foto = canvas.toDataURL('image/jpeg', 0.85);

        imgPrev.src = pasajeroBase64Foto;
        imgPrev.style.display = "block";
        contenedor.classList.add('hidden');

        // Apagar la cámara de inmediato para liberar recursos
        streamCamaraPasajero.getTracks().forEach(track => track.stop());
        streamCamaraPasajero = null;

        if (textoEstado) textoEstado.style.opacity = "0.2";
        
        // Limpieza de memoria RAM del canvas
        canvas.width = 1;
        canvas.height = 1;
        return;
    }

    // Primer toque: Enciende la cámara frontal en vivo dentro del círculo
    contenedor.classList.remove('hidden');
    imgPrev.style.display = 'none';

    try {
        streamCamaraPasajero = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 400 }, height: { ideal: 400 } },
            audio: false
        });
        video.srcObject = streamCamaraPasajero;
        if (textoEstado) textoEstado.style.opacity = "0.1"; // Se desvanece un poco para que se vea la cara
    } catch (err) {
        alert("No se pudo acceder a la cámara frontal. Revisa los permisos.");
        contenedor.classList.add('hidden');
    }
}
