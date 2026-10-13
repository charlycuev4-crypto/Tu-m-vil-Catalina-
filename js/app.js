function procesarFotoSelfie(input) {
    if (input.files && input.files[0]) {
        const archivo = input.files[0];
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const img = new Image();
            
            img.onload = function() {
                const canvas = document.createElement('canvas');
                
                // LÍMITE SEGURO DE MEMORIA: Restringir a 300x300 píxeles exactos
                const MAX_SIZE = 300;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                
                // Comprimir en JPEG al 80% de calidad para aligerar el almacenamiento y la red
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

                // LIBERACIÓN DE MEMORIA RAM: Evita fugas en navegadores móviles
                canvas.width = 1;
                canvas.height = 1;
            }
            
            img.onerror = function() {
                alert("No se pudo procesar la foto de la cámara. Intenta de nuevo.");
            }
            
            img.src = e.target.result;
        }
        
        reader.onerror = function() {
            alert("Error al leer el archivo de imagen.");
        }
        
        reader.readAsDataURL(archivo);
    }
}
