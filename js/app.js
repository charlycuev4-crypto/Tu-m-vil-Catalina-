function procesarArchivoSelfie(file) {
    if (!file.type.startsWith('image/')) {
        alert('Por favor selecciona un archivo de imagen válido.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Forzamos el tamaño final exacto a 300x300 píxeles
                canvas.width = 300;
                canvas.height = 300;
                
                // Calculamos el recorte cuadrado centrado para que la selfie no se deforme
                let sourceSize = Math.min(img.width, img.height);
                let sourceX = (img.width - sourceSize) / 2;
                let sourceY = (img.height - sourceSize) / 2;
                
                // Dibujamos, recortamos y encogemos la foto gigante a 300x300 de forma limpia
                ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 300, 300);
                
                // Comprimimos a JPEG con calidad 0.8 (liviano, rápido y sin problemas de memoria)
                pasajeroBase64Foto = canvas.toDataURL('image/jpeg', 0.8);
                
                const imgPrev = document.getElementById('imgPreview');
                if (imgPrev) {
                    imgPrev.src = pasajeroBase64Foto;
                    imgPrev.style.display = "block";
                }
                
                const silueta = document.getElementById('siluetaOverlay');
                if (silueta) {
                    silueta.style.opacity = "0.2";
                }
            } catch (err) {
                console.error("Error procesando imagen:", err);
                alert("La foto es demasiado grande. Por favor intenta tomar otra.");
            }
        };
        img.onerror = function() {
            alert("No se pudo leer la imagen de la cámara. Intenta nuevamente.");
        };
        img.src = e.target.result;
    };
    reader.onerror = function() {
        alert("Error al leer el archivo de la cámara.");
    };
    reader.readAsDataURL(file);
}
