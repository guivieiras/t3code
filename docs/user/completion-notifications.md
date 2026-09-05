# Completion notifications

Open **Settings → General → Completion notifications** to enable notifications
on this device for each connected environment. T3 notifies you when an agent turn
completes, including when you switch apps or lock your phone. Tap a notification
to open its thread. Use **Disable notifications** to stop them for an environment.

Use a trusted **HTTPS** address. Plain HTTP network addresses do not support Web
Push, even over a VPN. On iPhone or iPad running iOS/iPadOS 16.4 or later, first add
T3 to the Home Screen and open it from that icon. Allow notifications when asked.
Chrome on Android does not require Home Screen installation.

Notifications belong to this browser installation and website address. Enable
them separately on other devices or after changing the address you use for T3.
If you previously blocked notifications, allow them in the browser or phone's
notification settings, then return to T3's settings.

Your T3 server sends encrypted notifications through your browser's push service.
Both the server and phone need internet access. T3 Connect and a publicly exposed
server are not required. Opening the thread still requires access to its
environment, including your VPN when applicable.

Notifications show the thread title, project, and branch. They cover successful
turn completion across providers; failures and approval requests do not generate
these alerts. Existing completed turns do not notify when you enable the feature.
Delivery is best-effort and follows your phone's notification and Focus settings.

Revoking or expiring the paired session stops its notifications. After pairing
again, enable notifications again. If the browser expires a subscription, return
to these settings to enable it again. Desktop and native mobile notifications
continue using their existing delivery mechanisms.
