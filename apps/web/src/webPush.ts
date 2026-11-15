import type { EnvironmentId } from "@t3tools/contracts";

function notificationScope(environmentId: EnvironmentId): string {
  return `/web-push/${encodeURIComponent(environmentId)}/`;
}

/** Why this browser cannot receive push notifications, or null when it can. */
export function notificationAvailability(): string | null {
  if (window.location.protocol !== "https:" || !window.isSecureContext) {
    return "Open T3 Code from a trusted HTTPS address to turn on push notifications.";
  }
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "This browser does not support push notifications. On iPhone or iPad, add T3 Code to the Home Screen and open it from there.";
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
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const existing = subscription.options.applicationServerKey;
  if (!existing) return false;
  const bytes = new Uint8Array(existing);
  return bytes.length === key.length && key.every((byte, index) => bytes[index] === byte);
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
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
  const existing = await registration.pushManager.getSubscription();
  // A subscription made for another key, such as after the server's keys were reset, cannot be reused.
  if (existing && sameKey(existing, key)) return existing;
  await existing?.unsubscribe();
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}
