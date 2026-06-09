package pro.chatcat.paysync

import android.Manifest
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.provider.Telephony
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class SetupActivity : AppCompatActivity() {

    // Steps: 1=Allow Restricted Settings, 2=Notification Access,
    //        3=Notification Permission, 4=Default SMS App, 5=Battery, 6=Autostart
    private var currentStep = 1
    private var batterySettingsOpened = false
    private var autostartSettingsOpened = false
    private var restrictedSettingsOpened = false

    private val REQ_DEFAULT_SMS = 100
    private val REQ_NOTIF       = 102

    private lateinit var stepCounter:    TextView
    private lateinit var setupProgress:  ProgressBar
    private lateinit var stepIcon:       TextView
    private lateinit var stepTitle:      TextView
    private lateinit var stepDesc:       TextView
    private lateinit var stepWhy:        TextView
    private lateinit var grantedRow:     View
    private lateinit var actionBtn:      Button
    private lateinit var confirmDoneBtn: Button
    private lateinit var skipBtn:        Button

    private val prefs: SharedPreferences by lazy {
        getSharedPreferences("setup_prefs", Context.MODE_PRIVATE)
    }

    data class StepData(
        val icon: String, val title: String,
        val desc: String, val why: String, val btnLabel: String
    )

    private val steps = listOf(
        StepData(
            icon = "🔓",
            title = "App Permission Unlock করুন",
            desc = "ChatCat PaySync-কে notification পড়ার permission দিতে আগে একবার unlock করতে হবে।",
            why = "💡 নিচের বাটন চাপলে App Info page খুলবে।\n\n" +
                    "① উপরে ডানে ⋮ (তিন-ডট) বাটন চাপুন\n" +
                    "② \"Allow restricted settings\" চাপুন\n" +
                    "③ ফিরে এসে \"হয়ে গেছে\" চাপুন",
            btnLabel = "App Info খুলুন →"
        ),
        StepData(
            icon = "🔔",
            title = "Notification Access চালু করুন",
            desc = "ChatCat PaySync কে notification পড়ার অনুমতি দিন। তালিকায় ChatCat PaySync খুঁজে Toggle ON করুন।",
            why = "💡 কেন দরকার?\nbKash / Nagad / Rocket এর payment notification পড়ে auto-verify করার জন্য এই permission লাগবে।",
            btnLabel = "Notification Access Settings খুলুন"
        ),
        StepData(
            icon = "📳",
            title = "নোটিফিকেশন পারমিশন",
            desc = "PaySync চলার সময় status bar এ notification দেখাতে এই অনুমতি লাগবে।",
            why = "💡 কেন দরকার?\nBackground service চলার সময় Android এর requirement অনুযায়ী একটি ছোট notification দেখাতে হয়।",
            btnLabel = "নোটিফিকেশন Allow করুন"
        ),
        StepData(
            icon = "📲",
            title = "Default SMS App সেট করুন",
            desc = "ChatCat PaySync কে Default SMS App হিসেবে সেট করুন — এটা SMS সরাসরি পড়তে পারবে।",
            why = "💡 Restricted settings unlock করার পর এটা সম্ভব!\n\nDefault SMS App হলে বিকাশ/নগদ/রকেট এর SMS সরাসরি পড়া যাবে — notification ছাড়াই। এটা আরও reliable।\n\nপরে আবার আগের SMS app Default করতে পারবেন।",
            btnLabel = "Default SMS App সেট করুন"
        ),
        StepData(
            icon = "⚡",
            title = "ব্যাটারি অপ্টিমাইজেশন বন্ধ",
            desc = "ফোন lock থাকলেও PaySync চলবে, কোনো payment মিস হবে না।",
            why = "💡 কেন দরকার?\nAndroid battery বাঁচাতে background app বন্ধ করে দেয়। এই সেটিং না দিলে ফোন lock এর পর payment notification মিস হবে।",
            btnLabel = "Battery সেটিং খুলুন"
        ),
        StepData(
            icon = "🚀",
            title = "Autostart চালু করুন",
            desc = "ফোন restart হলে PaySync স্বয়ংক্রিয়ভাবে চালু হবে।",
            why = "💡 কেন দরকার?\nXiaomi, Samsung, Huawei সহ অনেক phone নিজে background app বন্ধ করে দেয়। Autostart enable করলে reboot এর পরেও PaySync চলবে।",
            btnLabel = "Autostart Settings খুলুন"
        )
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        androidx.appcompat.app.AppCompatDelegate.setDefaultNightMode(
            androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_NO
        )
        super.onCreate(savedInstanceState)
        if (allDone()) { goToMain(); return }

        setContentView(R.layout.activity_setup)

        stepCounter    = findViewById(R.id.stepCounter)
        setupProgress  = findViewById(R.id.setupProgress)
        stepIcon       = findViewById(R.id.stepIcon)
        stepTitle      = findViewById(R.id.stepTitle)
        stepDesc       = findViewById(R.id.stepDesc)
        stepWhy        = findViewById(R.id.stepWhy)
        grantedRow     = findViewById(R.id.grantedRow)
        actionBtn      = findViewById(R.id.actionBtn)
        confirmDoneBtn = findViewById(R.id.confirmDoneBtn)
        skipBtn        = findViewById(R.id.skipBtn)

        setupProgress.max = 6
        currentStep = firstIncompleteStep()
        renderStep()

        actionBtn.setOnClickListener      { handleAction() }
        confirmDoneBtn.setOnClickListener { confirmAndAdvance() }
        skipBtn.setOnClickListener {
            if (currentStep == 6) prefs.edit().putBoolean("autostart_done", true).apply()
            advanceStep()
        }
    }

    override fun onResume() {
        super.onResume()
        if (!::actionBtn.isInitialized) return
        // Auto-advance if step is now done (returned from system settings)
        if (currentStep in listOf(2, 3, 4) && stepIsDone(currentStep)) {
            android.os.Handler(mainLooper).postDelayed({ advanceStep() }, 400)
            return
        }
        renderStep()
    }

    // ── Render ────────────────────────────────────────────────────────────────

    private fun renderStep() {
        if (currentStep > 6) { goToMain(); return }

        val step = steps[currentStep - 1]
        val nums = listOf("১", "২", "৩", "৪", "৫", "৬")

        stepCounter.text       = "ধাপ ${nums[currentStep - 1]}/৬"
        setupProgress.progress = currentStep
        stepIcon.text          = step.icon
        stepTitle.text         = step.title
        stepDesc.text          = step.desc
        stepWhy.text           = if (currentStep == 6) autostartInstructions() else step.why

        val isDone = stepIsDone(currentStep)

        if (isDone) {
            grantedRow.visibility     = View.VISIBLE
            actionBtn.text            = "পরবর্তী ধাপ →"
            actionBtn.backgroundTintList = tintOf(R.color.success)
            confirmDoneBtn.visibility = View.GONE
            skipBtn.visibility        = View.GONE
        } else {
            grantedRow.visibility  = View.GONE
            actionBtn.text         = step.btnLabel
            actionBtn.backgroundTintList = tintOf(R.color.brand_primary)
            skipBtn.visibility     = View.VISIBLE

            // Battery/Autostart: show confirm button after settings opened
            confirmDoneBtn.visibility = when {
                currentStep == 1 && restrictedSettingsOpened -> View.VISIBLE
                currentStep == 5 && batterySettingsOpened    -> View.VISIBLE
                currentStep == 6 && autostartSettingsOpened  -> View.VISIBLE
                else                                          -> View.GONE
            }
        }
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    private fun handleAction() {
        if (stepIsDone(currentStep)) { advanceStep(); return }
        when (currentStep) {
            1 -> {
                restrictedSettingsOpened = true
                startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.parse("package:$packageName")
                    }
                )
                android.os.Handler(mainLooper).postDelayed({ renderStep() }, 1500)
            }
            2 -> startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            3 -> requestNotifPermission()
            4 -> requestDefaultSmsApp()
            5 -> {
                batterySettingsOpened = true
                requestBattery()
                android.os.Handler(mainLooper).postDelayed({ renderStep() }, 1500)
            }
            6 -> {
                autostartSettingsOpened = true
                openAutostartSettings()
                android.os.Handler(mainLooper).postDelayed({ renderStep() }, 1500)
            }
        }
    }

    private fun confirmAndAdvance() {
        when (currentStep) {
            1 -> prefs.edit().putBoolean("restricted_done", true).apply()
            5 -> prefs.edit().putBoolean("battery_done", true).apply()
            6 -> prefs.edit().putBoolean("autostart_done", true).apply()
        }
        advanceStep()
    }

    private fun requestNotifPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ActivityCompat.requestPermissions(
                this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIF
            )
        } else {
            advanceStep()
        }
    }

    private fun requestDefaultSmsApp() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val rm = getSystemService(RoleManager::class.java)
            if (rm.isRoleAvailable(RoleManager.ROLE_SMS) && !rm.isRoleHeld(RoleManager.ROLE_SMS)) {
                startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_SMS), REQ_DEFAULT_SMS)
            } else {
                advanceStep()
            }
        } else {
            val intent = Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT).apply {
                putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, packageName)
            }
            startActivityForResult(intent, REQ_DEFAULT_SMS)
        }
    }

    private fun requestBattery() {
        try {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
            )
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun openAutostartSettings() {
        val brand = Build.MANUFACTURER.lowercase()
        val intent: Intent? = when {
            brand.contains("xiaomi") || brand.contains("redmi") -> tryIntent(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"
            )
            brand.contains("huawei") || brand.contains("honor") -> tryIntent(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
            )
            brand.contains("samsung") -> tryIntent(
                "com.samsung.android.lool",
                "com.samsung.android.sm.ui.battery.BatteryActivity"
            )
            brand.contains("oppo") || brand.contains("realme") -> tryIntent(
                "com.coloros.safecenter",
                "com.coloros.safecenter.startupapp.StartupAppListActivity"
            )
            brand.contains("vivo") -> tryIntent(
                "com.vivo.permissionmanager",
                "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
            )
            brand.contains("oneplus") -> tryIntent(
                "com.oneplus.security",
                "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"
            )
            brand.contains("asus") -> tryIntent(
                "com.asus.mobilemanager",
                "com.asus.mobilemanager.autostart.AutoStartActivity"
            )
            else -> null
        }

        val launched = intent?.let { runCatching { startActivity(it); true }.getOrDefault(false) } ?: false
        if (!launched) {
            startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:$packageName")
                }
            )
        }
    }

    private fun tryIntent(pkg: String, cls: String) = Intent().apply {
        component = ComponentName(pkg, cls)
    }

    // ── Callbacks ─────────────────────────────────────────────────────────────

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
            android.os.Handler(mainLooper).postDelayed({ advanceStep() }, 400)
        } else renderStep()
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_DEFAULT_SMS) {
            if (isDefaultSmsApp()) {
                // Confirmed set — advance
                android.os.Handler(mainLooper).postDelayed({ advanceStep() }, 400)
            } else {
                // Not set — stay on step, show feedback
                renderStep()
                stepWhy.text = "⚠️ Default SMS App সেট হয়নি।\n\nআবার বাটনে চাপুন এবং dialog এ \"Set as default\" / \"Allow\" চাপুন।\n\nঅথবা \"পরে দেব\" চাপলে Notification Listener দিয়েই কাজ চলবে।"
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun advanceStep() {
        currentStep++
        batterySettingsOpened   = false
        autostartSettingsOpened = false
        while (currentStep <= 6 && stepIsDone(currentStep)) currentStep++
        renderStep()
    }

    private fun goToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    private fun firstIncompleteStep(): Int {
        for (i in 1..6) if (!stepIsDone(i)) return i
        return 7
    }

    private fun stepIsDone(step: Int) = when (step) {
        1    -> prefs.getBoolean("restricted_done", false)
        2    -> isNotificationListenerEnabled()
        3    -> hasNotifPermission()
        4    -> isDefaultSmsApp()
        5    -> isBatteryOptimizationIgnored() || prefs.getBoolean("battery_done", false)
        6    -> prefs.getBoolean("autostart_done", false)
        else -> true
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val cn   = ComponentName(this, SmsNotificationListener::class.java)
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        return flat.contains(cn.flattenToString())
    }

    private fun hasNotifPermission() =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        else true

    private fun isDefaultSmsApp(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val rm = getSystemService(RoleManager::class.java)
            rm.isRoleHeld(RoleManager.ROLE_SMS)
        } else {
            Telephony.Sms.getDefaultSmsPackage(this) == packageName
        }
    }

    private fun isBatteryOptimizationIgnored(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun allDone() = (1..6).all { stepIsDone(it) }

    private fun autostartInstructions(): String {
        val brand = Build.MANUFACTURER.lowercase()
        return when {
            brand.contains("xiaomi") || brand.contains("redmi") ->
                "📱 Xiaomi/MIUI:\nSecurity app → Manage apps → ChatCat PaySync → Autostart → ON"
            brand.contains("samsung") ->
                "📱 Samsung:\nSettings → Battery & device care → Battery → Background usage limits → Never sleeping apps → PaySync যোগ করুন"
            brand.contains("huawei") || brand.contains("honor") ->
                "📱 Huawei/Honor:\nSettings → Apps → ChatCat PaySync → Battery → App launch → Manage manually → Auto-launch ON"
            brand.contains("oppo") || brand.contains("realme") ->
                "📱 OPPO/Realme:\nSafe Center → Startup Manager → ChatCat PaySync ON"
            brand.contains("vivo") ->
                "📱 Vivo:\niManager → App Manager → Autostart → ChatCat PaySync ON"
            else ->
                "💡 Security/Phone Manager app খুলুন → Autostart বা Background App Management → ChatCat PaySync চালু করুন।"
        }
    }

    private fun tintOf(colorRes: Int) =
        android.content.res.ColorStateList.valueOf(ContextCompat.getColor(this, colorRes))
}
