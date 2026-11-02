# Browser push notifications

Turn on **Push notifications** in **Settings → General → Notifications** to have this browser notify you when an agent turn finishes, even after you close T3 Code or lock your phone. Each connected environment has its own switch. Tap a notification to open its thread. Turn the switch off to stop notifications for that environment on this browser.

Open T3 Code from a trusted **HTTPS** address, such as app.t3.codes, T3 Connect, or Tailscale HTTPS. Plain HTTP network addresses cannot receive push notifications, even over a VPN. On iPhone or iPad with iOS or iPadOS 16.4 or later, first add T3 Code to the Home Screen and open it from that icon, then allow notifications when asked. Chrome on Android works without installing T3 Code.

Notifications belong to this browser and the address you opened T3 Code from. Turn them on separately on other devices, or after you switch to a different address. If you previously blocked notifications, allow them in your browser or phone settings, then return to this setting.

Your environment sends encrypted notifications through your browser's push service, so both the environment and your device need internet access. Opening the thread from a notification still requires access to its environment, including your VPN when applicable.

Notifications show the thread title, project, and branch. They cover turns that finish; failures, approvals, and questions do not send these alerts, and neither do turns you stop. Turns that finished before you turned notifications on do not notify. Delivery is best-effort and follows your device's notification and Focus settings.

Signing out, revoking, or letting this browser's session expire stops its notifications; turn them on again after pairing again. The desktop app uses its own notifications instead, and the mobile app uses [mobile notifications](./mobile-notifications.md).
