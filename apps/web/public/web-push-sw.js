/* global self */

// This worker only handles notifications; it does not cache or intercept pages.
self.addEventListener("push", (event) => {
  const payload = event.data?.json();
  if (!payload || typeof payload.title !== "string") return;
  const url = new URL(payload.url, self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/apple-touch-icon.png",
      data: { url: url.href },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data.url, self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = clients.find((client) => client.url === url.href);
      if (existing) await existing.focus();
      else await self.clients.openWindow(url.href);
    })(),
  );
});
