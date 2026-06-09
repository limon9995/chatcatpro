package pro.chatcat.paysync

import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

class SmsNotificationListener : NotificationListenerService() {

    private val client = OkHttpClient()
    private val DEFAULT_WEBHOOK = "https://api.chatcat.pro/sms-gateway/incoming"

    // SMS app package names to listen to
    private val smsPackages = setOf(
        "com.google.android.apps.messaging",   // Google Messages
        "com.samsung.android.messaging",        // Samsung Messages
        "com.android.mms",                      // Stock Android SMS
        "com.android.messaging",                // AOSP Messaging
        "com.bsb.hike",                         // Hike
        "com.coloros.message",                  // OnePlus/ColorOS
        "com.miui.sms",                         // MIUI Messages
        "com.huawei.message",                   // Huawei Messages
        "com.vivo.message",                     // Vivo Messages
    )

    // Payment keywords to identify payment SMS
    private val paymentKeywords = listOf(
        "bkash", "বিকাশ",
        "nagad", "নগদ",
        "rocket", "রকেট",
        "nexuspay",
        "dbbl",
        "taka", "টাকা",
        "tk.", "tk ",
        "received", "payment",
        "transaction", "transfer",
        "credited", "debited",
        "cash in", "cash out",
        "send money", "mobile recharge"
    )

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName ?: return

        // Only process SMS app notifications
        if (pkg !in smsPackages) return

        val extras = sbn.notification?.extras ?: return

        // Extract notification text
        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text  = extras.getCharSequence("android.text")?.toString()  ?: ""
        val bigText = extras.getCharSequence("android.bigText")?.toString() ?: ""

        val fullText = if (bigText.isNotEmpty()) bigText else text

        if (fullText.isEmpty()) return

        // Check if it looks like a payment SMS
        val lowerText = fullText.lowercase()
        val isPayment = paymentKeywords.any { lowerText.contains(it) }

        if (!isPayment) return

        Log.d("PaySync", "Payment notification detected from $title: $fullText")

        val prefs = applicationContext.getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
        val token = prefs.getString("pageToken", null)
        val webhookUrl = prefs.getString("webhookUrl", DEFAULT_WEBHOOK)
            ?.ifEmpty { DEFAULT_WEBHOOK } ?: DEFAULT_WEBHOOK

        if (token.isNullOrEmpty()) {
            Log.w("PaySync", "No pageToken configured")
            return
        }

        addLog(applicationContext, "$title থেকে পেমেন্ট নোটিফিকেশন পাওয়া গেছে...")
        forwardPayment(applicationContext, token, webhookUrl, fullText, title)
    }

    private fun forwardPayment(
        context: Context,
        token: String,
        webhookUrl: String,
        message: String,
        from: String
    ) {
        val url = "$webhookUrl?token=$token"

        val json = JSONObject().apply {
            put("message", message)
            put("from", from)
            put("timestamp", System.currentTimeMillis().toString())
            put("source", "notification_listener")
        }

        val body = json.toString()
            .toRequestBody("application/json; charset=utf-8".toMediaTypeOrNull())
        val request = Request.Builder().url(url).post(body).build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                incrementCounter(context, "fail_count")
                addLog(context, "❌ $from — ব্যর্থ: ${e.message}")
            }

            override fun onResponse(call: Call, response: Response) {
                val code = response.code
                response.close()
                if (code in 200..299) {
                    incrementCounter(context, "sync_count")
                    val time = java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault())
                        .format(java.util.Date())
                    context.getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
                        .edit().putString("last_sync", time).apply()
                    addLog(context, "✅ $from — সিঙ্ক সফল")
                } else {
                    incrementCounter(context, "fail_count")
                    addLog(context, "⚠️ $from — সার্ভার প্রত্যাখ্যান ($code)")
                }
            }
        })
    }

    private fun incrementCounter(context: Context, key: String) {
        val prefs = context.getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
        prefs.edit().putInt(key, prefs.getInt(key, 0) + 1).apply()
    }

    private fun addLog(context: Context, message: String) {
        val prefs = context.getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
        val time = java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault())
            .format(java.util.Date())
        val updated = "[$time] $message\n${prefs.getString("sync_logs", "") ?: ""}"
        prefs.edit().putString("sync_logs", updated.split("\n").take(20).joinToString("\n")).apply()
    }
}
