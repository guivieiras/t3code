import type { EnvironmentId } from "@t3tools/contracts";

export function notificationScope(environmentId: EnvironmentId): string {
  return `/web-push/${encodeURIComponent(environmentId)}/`;
}

export function notificationAvailability(): string | null {
  if (window.location.protocol !== "https:" || !window.isSecureContext) {
    return "Open T3 using a trusted HTTPS address to enable notifications.";
  }
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "This browser does not support push notifications. On iPhone, add T3 to the Home Screen and open it there.";
  }
  if (Notification.permission === "denied") {
    return "Notifications are blocked. Allow them in your browser or phone settings, then try again.";
  }
  return null;
}

export async function readNotificationSubscription(environmentId: EnvironmentId) {
  const registration = await navigator.serviceWorker.getRegistration(
    notificationScope(environmentId),
  );
  return registration?.pushManager.getSubscription() ?? null;
}

/** Each environment signs pushes with its own key, so it needs its own registration. */
export async function subscribeToNotifications(environmentId: EnvironmentId, publicKey: string) {
  const registration = await navigator.serviceWorker.register("/web-push-sw.js", {
    scope: notificationScope(environmentId),
  });
  if (!registration.active) {
    const worker = registration.installing ?? registration.waiting;
    if (!worker) throw new Error("Unable to start notifications. Please try again.");
    await new Promise<void>((resolve, reject) => {
      const changed = () => {
        if (worker.state !== "activated" && worker.state !== "redundant") return;
        worker.removeEventListener("statechange", changed);
        if (worker.state === "activated") resolve();
        else reject(new Error("Unable to start notifications. Please try again."));
      };
      worker.addEventListener("statechange", changed);
      changed();
    });
  }
  let subscription = await registration.pushManager.getSubscription();
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
  const existingKey = subscription?.options.applicationServerKey;
  if (
    subscription &&
    (!existingKey || !key.every((byte, i) => new Uint8Array(existingKey)[i] === byte))
  ) {
    await subscription.unsubscribe();
    subscription = null;
  }
  return (
    subscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }))
  );
}
