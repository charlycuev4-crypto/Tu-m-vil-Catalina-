// Service Worker para Tu Móvil Chofer
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Escucha mensajes desde el JavaScript principal para mostrar la notificación persistente
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'mostrarNotificacionFija') {
        self.registration.showNotification('Tu Móvil Chofer', {
            body: '🟢 Conectado y buscando nuevos viajes en tu zona...',
            icon: 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg',
            badge: 'https://images2.imgbox.com/39/3a/V39LpB1X_o.jpg',
            tag: 'servicio-conductor-activo',
            ongoing: true, // Notificación persistente en Android
            requireInteraction: true,
            silent: true
        });
    } else if (event.data && event.data.action === 'cerrarNotificacionFija') {
        self.registration.getNotifications({ tag: 'servicio-conductor-activo' }).then(notifications => {
            notifications.forEach(notification => notification.close());
        });
    }
});

// ==========================================
// EVENTO: AL HACER CLIC EN LA NOTIFICACIÓN
// ==========================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Si la aplicación ya está abierta en segundo plano, la enfoca y trae al frente
            for (const client of clientList) {
                if ('focus' in client) {
                    return client.focus();
                }
            }
            // Si estaba completamente cerrada, la abre de nuevo
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
