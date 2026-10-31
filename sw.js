// Service Worker para Tu Móvil Chofer (Optimizados Push & Segundo Plano)

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// 1. Escuchar notificaciones PUSH del sistema (incluso si la app / Chrome están cerrados)
self.addEventListener('push', (event) => {
    let data = { title: '🚖 ¡NUEVO VIAJE ENTRANTE!', body: 'Hay un viaje disponible cerca de tu ubicación. Toca para ver.' };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const opciones = {
        body: data.body || '¡Un pasajero solicita un viaje!',
        icon: 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg',
        badge: 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg',
        vibrate: [300, 100, 300, 100, 300, 100, 500], // Vibración fuerte estilo sirena
        tag: 'nuevo-viaje-alerta',
        renotify: true,
        requireInteraction: true, // Queda fija en pantalla hasta que el chofer la toque
        data: { url: '/conductor.html' }
    };

    event.waitUntil(
        self.registration.showNotification(data.title || '🚖 ¡NUEVO VIAJE ENTRANTE!', opciones)
    );
});

// 2. Mensajes internos desde conductor-app.js
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'mostrarNotificacionFija') {
        self.registration.showNotification('Tu Móvil Chofer', {
            body: '🟢 Conectado y buscando nuevos viajes en tu zona...',
            icon: 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg',
            badge: 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg',
            tag: 'servicio-conductor-activo',
            ongoing: true,
            requireInteraction: true,
            silent: true
        });
    } else if (event.data && event.data.action === 'cerrarNotificacionFija') {
        self.registration.getNotifications({ tag: 'servicio-conductor-activo' }).then(notifications => {
            notifications.forEach(notification => notification.close());
        });
    }
});

// 3. Al hacer clic en la notificación (trae la app al frente de inmediato)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data?.url || '/conductor.html');
            }
        })
    );
});
