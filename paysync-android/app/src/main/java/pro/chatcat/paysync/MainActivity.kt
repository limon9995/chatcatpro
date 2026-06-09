package pro.chatcat.paysync

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.textfield.TextInputEditText

class MainActivity : AppCompatActivity() {

    private val DEFAULT_WEBHOOK = "https://api.chatcat.pro/admin/sms-incoming"

    private lateinit var statusDot:        View
    private lateinit var statusText:       TextView
    private lateinit var tokenInput:       TextInputEditText
    private lateinit var saveButton:       Button
    private lateinit var permSmsIndicator: View
    private lateinit var permNotifIndicator: View
    private lateinit var grantPermissionBtn: Button
    private lateinit var logsTextView:     TextView
    private lateinit var clearLogsBtn:     Button
    private lateinit var statSyncCount:    TextView
    private lateinit var statFailCount:    TextView
    private lateinit var statLastSync:     TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        androidx.appcompat.app.AppCompatDelegate.setDefaultNightMode(
            androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_NO
        )
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusDot           = findViewById(R.id.statusDot)
        statusText          = findViewById(R.id.statusText)
        tokenInput          = findViewById(R.id.tokenInput)
        saveButton          = findViewById(R.id.saveButton)
        permSmsIndicator    = findViewById(R.id.permSmsIndicator)
        permNotifIndicator  = findViewById(R.id.permNotifIndicator)
        grantPermissionBtn  = findViewById(R.id.grantPermissionBtn)
        logsTextView        = findViewById(R.id.logsText)
        clearLogsBtn        = findViewById(R.id.clearLogsBtn)
        statSyncCount       = findViewById(R.id.statSyncCount)
        statFailCount       = findViewById(R.id.statFailCount)
        statLastSync        = findViewById(R.id.statLastSync)

        val prefs = getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
        tokenInput.setText(prefs.getString("pageToken", ""))

        updateUIStatus()
        updatePermissionIndicators()
        loadLogs()
        updateStats()

        saveButton.setOnClickListener {
            val token = tokenInput.text.toString().trim()

            if (token.isEmpty()) {
                Toast.makeText(this, "দয়া করে Secret Token দিন", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            prefs.edit().putString("pageToken", token).putString("webhookUrl", DEFAULT_WEBHOOK).apply()
            Toast.makeText(this, "কনফিগারেশন সেভ হয়েছে! ✅", Toast.LENGTH_SHORT).show()
            updateUIStatus()
            startPaySyncService()
            addLog("সিস্টেম অ্যাক্টিভেট করা হয়েছে।")
            loadLogs()
        }

        // "পারমিশন দিন" — goes to SetupActivity wizard
        grantPermissionBtn.setOnClickListener {
            startActivity(Intent(this, SetupActivity::class.java))
        }

        clearLogsBtn.setOnClickListener {
            prefs.edit()
                .putString("sync_logs", "")
                .putInt("sync_count", 0)
                .putInt("fail_count", 0)
                .putString("last_sync", "")
                .apply()
            loadLogs()
            updateStats()
            Toast.makeText(this, "লগ মুছে ফেলা হয়েছে।", Toast.LENGTH_SHORT).show()
        }

        if (isSetupComplete()) startPaySyncService()
    }

    override fun onResume() {
        super.onResume()
        updateUIStatus()
        updatePermissionIndicators()
        loadLogs()
        updateStats()
    }

    private fun updateUIStatus() {
        val token = getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
            .getString("pageToken", "")
        val active = !token.isNullOrEmpty() && isNotificationListenerEnabled()
        statusDot.setBackgroundResource(
            if (active) R.drawable.circle_green else R.drawable.circle_red
        )
        statusText.text = if (active) "অনলাইন" else "অফলাইন"
    }

    private fun updatePermissionIndicators() {
        // Indicator 1: Notification Listener
        permSmsIndicator.setBackgroundResource(
            if (isNotificationListenerEnabled()) R.drawable.circle_green else R.drawable.circle_red
        )
        // Indicator 2: Battery optimization
        permNotifIndicator.setBackgroundResource(
            if (isBatteryOptimizationIgnored()) R.drawable.circle_green else R.drawable.circle_red
        )
        grantPermissionBtn.visibility =
            if (isSetupComplete()) View.GONE else View.VISIBLE
    }

    private fun updateStats() {
        val prefs = getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
        statSyncCount.text = prefs.getInt("sync_count", 0).toString()
        statFailCount.text = prefs.getInt("fail_count", 0).toString()
        val last = prefs.getString("last_sync", "—")
        statLastSync.text  = if (last.isNullOrEmpty()) "—" else last
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val cn   = ComponentName(this, SmsNotificationListener::class.java)
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
            ?: return false
        return flat.contains(cn.flattenToString())
    }

    private fun isBatteryOptimizationIgnored(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        // Also accept manual confirmation from setup wizard (some devices don't report correctly)
        val manuallyConfirmed = getSharedPreferences("setup_prefs", Context.MODE_PRIVATE)
            .getBoolean("battery_done", false)
        return pm.isIgnoringBatteryOptimizations(packageName) || manuallyConfirmed
    }

    private fun isSetupComplete() = isNotificationListenerEnabled() && isBatteryOptimizationIgnored()

    private fun startPaySyncService() {
        val token = getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
            .getString("pageToken", "")
        if (!token.isNullOrEmpty() && isNotificationListenerEnabled()) {
            val intent = Intent(this, PaySyncService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(this, intent)
            } else {
                startService(intent)
            }
        }
    }

    private fun loadLogs() {
        val logs = getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
            .getString("sync_logs", "")
        logsTextView.text = if (logs.isNullOrEmpty()) "কোনো লগ পাওয়া যায়নি।" else logs
    }

    private fun addLog(message: String) {
        val prefs   = getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
        val time    = java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault()).format(java.util.Date())
        val updated = "[$time] $message\n${prefs.getString("sync_logs", "") ?: ""}"
        prefs.edit().putString("sync_logs", updated.split("\n").take(20).joinToString("\n")).apply()
    }
}
