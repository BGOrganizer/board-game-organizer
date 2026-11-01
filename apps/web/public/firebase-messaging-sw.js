self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  const data = payload.data ?? payload;
  if (!data.title) return;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.description,
      data: { href: data.href ?? "/notifications", attentionItemId: data.attentionItemId },
      icon: "/favicon.ico",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href ?? "/notifications";
  const url = new URL(href, self.location.origin);
  if (url.origin !== self.location.origin) return;
  const itemId = event.notification.data?.attentionItemId;
  if (typeof itemId === "string" && itemId.length <= 1000) {
    try {
      const point = JSON.parse(itemId);
      if (
        Array.isArray(point) &&
        point.length === 4 &&
        typeof point[1] === "string" &&
        url.pathname.endsWith(`/${point[1]}`)
      ) {
        url.searchParams.set("attention", itemId);
        url.hash = `attention-${encodeURIComponent(itemId)}`;
      }
    } catch {
      /* Historical pushes have no item hint. */
    }
  }
  event.waitUntil(clients.openWindow(url.href));
});
