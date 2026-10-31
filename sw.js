// Service Worker para Tu Móvil Chofer (Optimizado y Persistente)

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Fuerza la instalación inmediata
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim()); // Toma el control de la app de inmediato
});

// Escuchar eventos PUSH del servidor (para cuando la app esté cerrada)
self.addEventListener('push', (event) => {
    let data = { title: '🚖 ¡NUEVO VIAJE ENTRANTE!', body: 'Hay un viaje disponible cerca de tu ubicación.' };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const opciones = {
        body: data.body || '¡Un pasajero solicita un servicio!',
        icon: 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg',
        badge: 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg',
        vibrate: [300, 100, 300, 100, 300, 100, 500],
        tag: 'nuevo-viaje-alerta',
        renotify: true,
        requireInteraction: true,
        data: { url: '/conductor.html' }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, opciones)
    );
});

// Mensajes desde la app principal para la notificación persistente de estado
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'mostrarNotificacionFija') {
        self.registration.showNotification('Tu Móvil Chofer', {
            body: '🟢 Conectado y buscando nuevos viajes...',
            icon: 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg',
            badge: 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg',
            tag: 'servicio-conductor-activo',
            ongoing: true, // Mantiene la notificación fija en la barra superior de Android
            silent: true
        });
    } else if (event.data && event.data.action === 'cerrarNotificacionFija') {
        self.registration.getNotifications({ tag: 'servicio-conductor-activo' }).then(notifications => {
            notifications.forEach(notification => notification.close());
        });
    }
});

// Al hacer clic en la notificación, abre o trae al frente la app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/conductor.html');
        })
    );
});
