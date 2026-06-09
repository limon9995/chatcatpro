package pro.chatcat.paysync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

class SmsReceiver : BroadcastReceiver() {

    private val client = OkHttpClient()
    private val DEFAULT_WEBHOOK = "https://api.chatcat.pro/sms-gateway/incoming"

    private val paymentSenders = setOf(
        "bkash", "16247", "nagad", "16167",
        "dbbl", "16216", "rocket", "nexuspay"
    )

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION &&
            action != "android.provider.Telephony.SMS_DELIVER") return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        for (sms in messages) {
            val sender = sms.displayOriginatingAddress ?: ""
            val body   = sms.displayMessageBody ?: ""
            if (paymentSenders.none { sender.lowercase().contains(it) }) continue

            val prefs  = context.getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
            val token  = prefs.getString("pageToken", null) ?: continue
            val url    = prefs.getString("webhookUrl", DEFAULT_WEBHOOK)
                ?.ifEmpty { DEFAULT_WEBHOOK } ?: DEFAULT_WEBHOOK

            addLog(context, "$sender থেকে পেমেন্ট SMS পাওয়া গেছে...")
            forward(context, token, url, body, sender)
        }
    }

    private fun forward(context: Context, token: String, webhookUrl: String, message: String, from: String) {
        val json = JSONObject().apply {
            put("message", message); put("from", from)
            put("timestamp", System.currentTimeMillis().toString())
            put("source", "sms_direct")
        }
        val req = Request.Builder()
            .url("$webhookUrl?token=$token")
            .post(json.toString().toRequestBody("application/json".toMediaTypeOrNull()))
            .build()

        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                increment(context, "fail_count")
                addLog(context, "❌ $from — ব্যর্থ: ${e.message}")
            }
            override fun onResponse(call: Call, response: Response) {
                val code = response.code; response.close()
                if (code in 200..299) {
                    increment(context, "sync_count")
                    val t = java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault()).format(java.util.Date())
                    context.getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
                        .edit().putString("last_sync", t).apply()
                    addLog(context, "✅ $from — SMS সিঙ্ক সফল")
                } else {
                    increment(context, "fail_count")
                    addLog(context, "⚠️ $from — সার্ভার প্রত্যাখ্যান ($code)")
                }
            }
        })
    }

    private fun increment(context: Context, key: String) {
        val p = context.getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
        p.edit().putInt(key, p.getInt(key, 0) + 1).apply()
    }

    private fun addLog(context: Context, message: String) {
        val p = context.getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
        val t = java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault()).format(java.util.Date())
        val updated = "[$t] $message\n${p.getString("sync_logs", "") ?: ""}"
        p.edit().putString("sync_logs", updated.split("\n").take(20).joinToString("\n")).apply()
    }
}
