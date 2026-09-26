self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  const data = payload.data ?? payload;
  if (!data.title) return;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.description,
      data: { href: data.href ?? "/notifications" },
      icon: "/favicon.ico",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href ?? "/notifications";
  event.waitUntil(clients.openWindow(new URL(href, self.location.origin).href));
});
