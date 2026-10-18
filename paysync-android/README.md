# PaySync — Android SMS Forwarder

Background Android service that captures bKash, Nagad, Rocket, and other Mobile Financial Service (MFS) transaction SMS messages and forwards them to the ChatCat Pro backend for automatic payment verification.

---

## 📱 Overview

**PaySync** runs as a **foreground service** on the merchant's Android device. It monitors incoming SMS messages from known MFS short-codes (`16247`, `16167`, `16216`, etc.) and keywords (bKash, Nagad, Rocket, tk., টাকা, received, trxid, transaction). When a matching SMS is detected, it is forwarded via HTTPS to the ChatCat Pro `sms-gateway` webhook endpoint.

### Why this is needed
Bangladeshi MFS providers (bKash, Nagad, Rocket) do not provide merchant webhook callbacks for incoming payments. The only reliable way to verify customer payment claims automatically is to read the confirmation SMS on the merchant's own phone.

---

## 🏗 Architecture

```
┌──────────────────────┐     SMS Received      ┌──────────────────────┐
│  Merchant's Android  │ ───────────────────► │   PaySync Service    │
│  Phone (SIM card)    │                       │ (Foreground Service) │
└──────────────────────┘                       └──────────┬───────────┘
                                                           │
                                                           │ HTTPS POST (JSON)
                                                           ▼
┌──────────────────────┐                       ┌──────────────────────┐
│  ChatCat Backend     │ ◄─────────────────── │  sms-gateway webhook │
│  (PaymentVerifyModule)│                       │  /sms-gateway/incoming│
└──────────────────────┘                       └──────────────────────┘
```

---

## ⚙️ Key Components

| File | Purpose |
|------|---------|
| `PaySyncService.kt` | Main foreground service. Handles SMS inbox polling (fallback for all OEMs), heartbeat to backend, notification channel, and log persistence. |
| `SmsReceiver.kt` | BroadcastReceiver for `android.provider.Telephony.SMS_RECEIVED` — real-time SMS capture on supported devices. |
| `SmsNotificationListener.kt` | `NotificationListenerService` to catch MFS push notifications (OEMs that block SMS_RECEIVED). |
| `SetupActivity.kt` | UI for entering multiple Page Tokens (one per ChatCat Pro page) and testing connectivity. |
| `MainActivity.kt` | Simple launcher activity showing sync logs and service status. |
| `HeadlessSmsService.kt` | JobIntentService for Android 8+ background execution limits. |
| `BootReceiver.kt` | Auto-restarts PaySyncService on device boot. |

---

## 🔐 Security & Privacy

- **No SMS content leaves the device except matched MFS messages** — filtering happens locally.
- **Encrypted transit** — All forwarding uses HTTPS with TLS 1.2+.
- **Token-based auth** — Each page's SMS gateway token is stored in `SharedPreferences` (not hardcoded).
- **Minimal permissions**:
  - `RECEIVE_SMS` / `READ_SMS` (for inbox polling fallback)
  - `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_DATA_SYNC` (Android 14+)
  - `BIND_NOTIFICATION_LISTENER_SERVICE` (optional, for notification listener)
  - `RECEIVE_BOOT_COMPLETED` (auto-start on boot)
  - `INTERNET` (forward to backend)

---

## 🛠 Build & Install

### Prerequisites
- Android Studio (latest stable)
- Android SDK 34 (compile) / minSdk 24 (Android 7.0)
- Kotlin 1.9+

### Build Debug APK
```bash
cd paysync-android
./gradlew assembleDebug
```
Output: `app/build/outputs/apk/debug/app-debug.apk`

### Build Release APK (Signed)
```bash
./gradlew assembleRelease
# Requires signing config in local.properties or gradle.properties
```

---

## 📋 Setup Instructions (Merchant Side)

1. **Install APK** on the merchant's Android phone (the one receiving bKash/Nagad SMS).
2. **Open app** → Grant permissions when prompted:
   - SMS (Read/Receive)
   - Notification Access (Settings → Apps → Special Access → Notification Access)
   - Battery Optimization → "Don't optimize" for PaySync (critical for background survival)
3. **Enter Page Tokens**:
   - In ChatCat Pro Dashboard → Settings → WhatsApp/Payment → SMS Gateway
   - Copy the **Page Token** (one per connected Facebook page)
   - Paste into PaySync app → "Add Token" → Save
4. **Test**: Send a test SMS from another phone with format: `বিকাশ ৫০০ টাকা রিসিভ করা হয়েছে। TrxID: XYZ123`
5. **Verify** in Dashboard → Orders → Payment Verification logs

---

## 🔄 Backend Integration

The service posts to:
```
POST https://api.chatcat.pro/sms-gateway/incoming?pageToken=<PAGE_TOKEN>
Content-Type: application/json

{
  "message": "SMS body text",
  "from": "Sender number (e.g. 16247)",
  "timestamp": "1699999999999",
  "source": "sms_poll"  // or "sms_receiver", "notification_listener"
}
```

Backend validates token, parses amount/TrxID, matches against pending orders, and marks payment verified.

---

## 📄 License

Part of the ChatCat Pro project. MIT License.

---

## 🛟 Troubleshooting

| Issue | Solution |
|-------|----------|
| Service dies in background | Disable battery optimization for PaySync; ensure "Allow background activity" in App Info |
| SMS not received | Grant SMS permission; check Notification Access is ON |
| "No tokens configured" | Add at least one Page Token from Dashboard in Setup screen |
| Heartbeat fails | Check internet connectivity; verify API base URL is reachable |
