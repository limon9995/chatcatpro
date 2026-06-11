package pro.chatcat.paysync

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

class PaySyncService : Service() {

    private val CHANNEL_ID = "PaySyncServiceChannel"
    private val NOTIFICATION_ID = 1001
    private val httpClient = OkHttpClient()
    private val heartbeatHandler = Handler(Looper.getMainLooper())
    private val HEARTBEAT_INTERVAL = 15 * 60 * 1000L // 15 minutes

    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            sendHeartbeat()
            heartbeatHandler.postDelayed(this, HEARTBEAT_INTERVAL)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notificationIntent = Intent(this, MainActivity::class.java)
        
        val pendingIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            pendingIntentFlags
        )

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ChatCat PaySync Active")
            .setContentText("বিকাশ/নগদ পেমেন্ট মেসেজ সিঙ্ক করা হচ্ছে...")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()

        // Start Foreground with Data Sync Type for Android 14 (API 34) Compatibility
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID, 
                notification, 
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // Start heartbeat immediately and every 15 minutes
        heartbeatHandler.post(heartbeatRunnable)

        // START_STICKY ensures the service restarts if system kills it for memory
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        heartbeatHandler.removeCallbacks(heartbeatRunnable)
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    private fun getTokens(): List<String> {
        val prefs = getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
        val raw = prefs.getString("pageTokens", null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { arr.getString(it) }
        } catch (e: Exception) { emptyList() }
    }

    private fun sendHeartbeat() {
        val tokens = getTokens()
        if (tokens.isEmpty()) return
        val deviceName  = Build.MODEL
        val deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}"
        tokens.forEach { token ->
            val json = JSONObject().apply {
                put("token", token)
                put("deviceName", deviceName)
                put("deviceModel", deviceModel)
            }
            val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaTypeOrNull())
            val request = Request.Builder()
                .url("https://api.chatcat.pro/sms-gateway/connect")
                .post(body)
                .build()
            httpClient.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) { /* silent */ }
                override fun onResponse(call: Call, response: Response) { response.close() }
            })
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "ChatCat PaySync Background Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(serviceChannel)
        }
    }
}
