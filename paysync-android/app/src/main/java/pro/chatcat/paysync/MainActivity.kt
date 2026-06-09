package pro.chatcat.paysync

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private val PERMISSION_REQUEST_CODE = 200

    private lateinit var statusDot: View
    private lateinit var statusText: TextView
    private lateinit var tokenInput: EditText
    private lateinit var saveButton: Button
    private lateinit var permSmsIndicator: View
    private lateinit var permNotifIndicator: View
    private lateinit var grantPermissionBtn: Button
    private lateinit var logsTextView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Initialize UI Elements
        statusDot = findViewById(R.id.statusDot)
        statusText = findViewById(R.id.statusText)
        tokenInput = findViewById(R.id.tokenInput)
        saveButton = findViewById(R.id.saveButton)
        permSmsIndicator = findViewById(R.id.permSmsIndicator)
        permNotifIndicator = findViewById(R.id.permNotifIndicator)
        grantPermissionBtn = findViewById(R.id.grantPermissionBtn)
        logsTextView = findViewById(R.id.logsText)

        // Load Saved Token
        val sharedPref = getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
        val savedToken = sharedPref.getString("pageToken", "")
        tokenInput.setText(savedToken)

        // Update UI Statuses
        updateUIStatus(savedToken)
        updatePermissionIndicators()
        loadLogs()

        // Save Button Handler
        saveButton.setOnClickListener {
            val token = tokenInput.text.toString().trim()
            if (token.isNotEmpty()) {
                sharedPref.edit().putString("pageToken", token).apply()
                Toast.makeText(this, "কনফিগারেশন সেভ হয়েছে! ✅", Toast.LENGTH_SHORT).show()
                updateUIStatus(token)
                startPaySyncService()
                addLog("সিস্টেম অ্যাক্টিভেট করা হয়েছে।")
                loadLogs()
            } else {
                Toast.makeText(this, "দয়া করে পেজ টোকেন দিন", Toast.LENGTH_SHORT).show()
            }
        }

        // Grant Permissions Button Handler
        grantPermissionBtn.setOnClickListener {
            requestPermissions()
        }

        // Auto request permissions if not granted
        if (!hasSmsPermissions() || !hasNotificationPermissions()) {
            requestPermissions()
        } else {
            startPaySyncService()
        }
    }

    override fun onResume() {
        super.onResume()
        updatePermissionIndicators()
        loadLogs()
    }

    private fun updateUIStatus(token: String?) {
        if (!token.isNullOrEmpty() && hasSmsPermissions()) {
            statusDot.setBackgroundResource(R.drawable.circle_green)
            statusText.text = "সিঙ্ক একটিভ আছে"
            statusText.setTextColor(ContextCompat.getColor(this, R.color.success))
        } else {
            statusDot.setBackgroundResource(R.drawable.circle_red)
            statusText.text = "সেটআপ বা অনুমতি প্রয়োজন"
            statusText.setTextColor(ContextCompat.getColor(this, R.color.error))
        }
    }

    private fun updatePermissionIndicators() {
        if (hasSmsPermissions()) {
            permSmsIndicator.setBackgroundResource(R.drawable.circle_green)
        } else {
            permSmsIndicator.setBackgroundResource(R.drawable.circle_red)
        }

        if (hasNotificationPermissions()) {
            permNotifIndicator.setBackgroundResource(R.drawable.circle_green)
        } else {
            permNotifIndicator.setBackgroundResource(R.drawable.circle_red)
        }

        if (hasSmsPermissions() && hasNotificationPermissions()) {
            grantPermissionBtn.visibility = View.GONE
        } else {
            grantPermissionBtn.visibility = View.VISIBLE
        }
    }

    private fun hasSmsPermissions(): Boolean {
        val receiveSms = ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS)
        val readSms = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS)
        return receiveSms == PackageManager.PERMISSION_GRANTED && readSms == PackageManager.PERMISSION_GRANTED
    }

    private fun hasNotificationPermissions(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    private fun requestPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        ActivityCompat.requestPermissions(this, permissions.toTypedArray(), PERMISSION_REQUEST_CODE)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST_CODE) {
            updatePermissionIndicators()
            val sharedPref = getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
            val token = sharedPref.getString("pageToken", "")
            updateUIStatus(token)
            if (hasSmsPermissions() && !token.isNullOrEmpty()) {
                startPaySyncService()
            }
        }
    }

    private fun startPaySyncService() {
        val sharedPref = getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
        val token = sharedPref.getString("pageToken", "")
        if (!token.isNullOrEmpty() && hasSmsPermissions()) {
            val serviceIntent = Intent(this, PaySyncService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(this, serviceIntent)
            } else {
                startService(serviceIntent)
            }
        }
    }

    private fun loadLogs() {
        val sharedPref = getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
        val logs = sharedPref.getString("sync_logs", "কোনো লগ পাওয়া যায়নি।")
        logsTextView.text = logs
    }

    private fun addLog(message: String) {
        val sharedPref = getSharedPreferences("ChatCatPrefs", Context.MODE_PRIVATE)
        val currentLogs = sharedPref.getString("sync_logs", "") ?: ""
        val timestamp = java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault()).format(java.util.Date())
        val newLogs = "[$timestamp] $message\n$currentLogs"
        
        // Keep logs short (last 10 lines)
        val lines = newLogs.split("\n")
        val truncated = lines.take(10).joinToString("\n")
        
        sharedPref.edit().putString("sync_logs", truncated).apply()
    }
}
