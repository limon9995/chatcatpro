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

    // Payment Sender IDs
    private val paymentSenders = setOf(
        "bkash", "16247", 
        "nagad", "16167", 
        "dbbl", "16216", 
        "rocket", "nexuspay"
    )

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            for (sms in messages) {
                val sender = sms.displayOriginatingAddress ?: ""
                val senderLower = sender.lowercase()
                val messageBody = sms.displayMessageBody ?: ""

                // Verify if it is a payment SMS
                val isPayment = paymentSenders.any { senderLower.contains(it) }

                if (isPayment) {
                    val sharedPref = context.getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
                    val pageToken = sharedPref.getString("pageToken", null)

                    if (!pageToken.isNullOrEmpty()) {
                        addLog(context, "$sender থেকে নতুন মেসেজ এসেছে। সিঙ্ক করা হচ্ছে...")
                        forwardPaymentSms(context, pageToken, messageBody, sender)
                    } else {
                        Log.w("ChatCatPaySync", "No pageToken configured. SMS ignored.")
                    }
                }
            }
        }
    }

    private fun forwardPaymentSms(context: Context, pageToken: String, message: String, from: String) {
        val url = "https://api.chatcat.pro/sms-gateway/incoming?pageToken=$pageToken"
        
        val json = JSONObject().apply {
            put("message", message)
            put("from", from)
            put("timestamp", System.currentTimeMillis().toString())
        }

        val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaTypeOrNull())
        val request = Request.Builder()
            .url(url)
            .post(body)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("ChatCatPaySync", "SMS Sync failed", e)
                addLog(context, "❌ $from এর পেমেন্ট সিঙ্ক ব্যর্থ হয়েছে: ${e.message}")
            }

            override fun onResponse(call: Call, response: Response) {
                val code = response.code
                response.close()
                if (code == 200) {
                    Log.d("ChatCatPaySync", "SMS Sync success")
                    addLog(context, "✅ $from এর পেমেন্ট সিঙ্ক সফল হয়েছে।")
                } else {
                    Log.w("ChatCatPaySync", "SMS Sync returned status $code")
                    addLog(context, "⚠️ $from এর পেমেন্ট সিঙ্ক সার্ভার প্রত্যাখ্যান করেছে ($code)।")
                }
            }
        })
    }

    private fun addLog(context: Context, message: String) {
        val sharedPref = context.getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
        val currentLogs = sharedPref.getString("sync_logs", "") ?: ""
        val timestamp = java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault()).format(java.util.Date())
        val newLogs = "[$timestamp] $message\n$currentLogs"
        
        // Keep logs short (last 10 lines)
        val lines = newLogs.split("\n")
        val truncated = lines.take(10).joinToString("\n")
        
        sharedPref.edit().putString("sync_logs", truncated).apply()
    }
}
