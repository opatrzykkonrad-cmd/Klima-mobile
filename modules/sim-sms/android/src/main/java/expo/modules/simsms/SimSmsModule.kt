package expo.modules.simsms

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Wysyłka SMS bezpośrednio z karty SIM przez Android SmsManager.
 * Promise rozwiązuje się dopiero po potwierdzeniu od sieci (sentIntent) dla KAŻDEJ części wiadomości,
 * więc status SENT_SIM w aplikacji oznacza realne wysłanie, a nie tylko przekazanie do systemu.
 */
class SimSmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("SimSms")

    // Zapis awarii natywnej do pliku – aplikacja pokaże raport przy następnym uruchomieniu.
    OnCreate {
      installCrashRecorder()
    }

    Function("getLastCrash") {
      crashFile()?.takeIf { it.exists() }?.readText()
    }

    Function("clearLastCrash") {
      crashFile()?.delete()
      null
    }

    Function("isAvailable") {
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)
    }

    Function("hasPermission") {
      isGranted(Manifest.permission.SEND_SMS)
    }

    Function("getSimCards") {
      listSimCards()
    }

    AsyncFunction("sendSms") { phone: String, message: String, subscriptionId: Int?, promise: Promise ->
      sendSms(phone, message, subscriptionId, promise)
    }
  }

  private fun crashFile(): File? =
    appContext.reactContext?.applicationContext?.filesDir?.let { File(it, "last-crash.txt") }

  private fun installCrashRecorder() {
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    if (previous is CrashRecorder) return
    Thread.setDefaultUncaughtExceptionHandler(CrashRecorder(previous) { crashFile() })
  }

  private class CrashRecorder(
    private val previous: Thread.UncaughtExceptionHandler?,
    private val fileProvider: () -> File?
  ) : Thread.UncaughtExceptionHandler {
    override fun uncaughtException(thread: Thread, error: Throwable) {
      try {
        val sw = StringWriter()
        error.printStackTrace(PrintWriter(sw))
        val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
        fileProvider()?.writeText("$stamp  wątek: ${thread.name}\n\n${sw.toString().take(12000)}")
      } catch (_: Throwable) { }
      previous?.uncaughtException(thread, error)
    }
  }

  private fun isGranted(permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  private fun listSimCards(): List<Map<String, Any?>> {
    if (!isGranted(Manifest.permission.READ_PHONE_STATE)) return emptyList()
    val manager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
      ?: return emptyList()
    return try {
      (manager.activeSubscriptionInfoList ?: emptyList()).map { info ->
        mapOf(
          "subscriptionId" to info.subscriptionId,
          "slot" to info.simSlotIndex,
          "carrier" to info.carrierName?.toString(),
          "displayName" to info.displayName?.toString()
        )
      }
    } catch (e: SecurityException) {
      emptyList()
    }
  }

  @Suppress("DEPRECATION")
  private fun smsManagerFor(subscriptionId: Int?): SmsManager {
    val useSub = subscriptionId != null && subscriptionId >= 0
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val base = context.getSystemService(SmsManager::class.java)
        ?: throw IllegalStateException("SmsManager niedostępny na tym urządzeniu")
      return if (useSub) base.createForSubscriptionId(subscriptionId!!) else base
    }
    return if (useSub) SmsManager.getSmsManagerForSubscriptionId(subscriptionId!!) else SmsManager.getDefault()
  }

  private fun describeError(code: Int): String = when (code) {
    SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "Błąd ogólny operatora (brak środków, zablokowana usługa SMS lub odrzucony numer)"
    SmsManager.RESULT_ERROR_RADIO_OFF -> "Radio wyłączone – sprawdź tryb samolotowy"
    SmsManager.RESULT_ERROR_NULL_PDU -> "Błąd formatu wiadomości (PDU)"
    SmsManager.RESULT_ERROR_NO_SERVICE -> "Brak zasięgu sieci komórkowej"
    SmsManager.RESULT_ERROR_LIMIT_EXCEEDED -> "Przekroczono limit SMS systemu Android – odczekaj chwilę"
    SmsManager.RESULT_ERROR_SHORT_CODE_NOT_ALLOWED -> "Wysyłka na numer skrócony jest zablokowana"
    SmsManager.RESULT_ERROR_SHORT_CODE_NEVER_ALLOWED -> "Wysyłka na numer skrócony jest zablokowana na stałe"
    else -> "Błąd wysyłki SMS (kod $code)"
  }

  private fun sendSms(phone: String, message: String, subscriptionId: Int?, promise: Promise) {
    if (!isGranted(Manifest.permission.SEND_SMS)) {
      promise.reject("ERR_PERMISSION", "Brak uprawnienia do wysyłania SMS", null)
      return
    }
    if (phone.isBlank() || message.isBlank()) {
      promise.reject("ERR_ARGS", "Pusty numer lub treść wiadomości", null)
      return
    }

    val manager = try {
      smsManagerFor(subscriptionId)
    } catch (e: Exception) {
      promise.reject("ERR_SIM", e.message ?: "Nie można użyć karty SIM", e)
      return
    }

    val parts = manager.divideMessage(message)
    val total = parts.size
    val action = "${context.packageName}.SIM_SMS_SENT.${UUID.randomUUID()}"
    val remaining = AtomicInteger(total)
    val finished = AtomicBoolean(false)
    val appContext = context.applicationContext

    lateinit var receiver: BroadcastReceiver
    val unregister = {
      try { appContext.unregisterReceiver(receiver) } catch (_: Exception) { }
    }
    val timeout = Runnable {
      if (finished.compareAndSet(false, true)) {
        unregister()
        promise.reject("ERR_TIMEOUT", "Brak potwierdzenia wysłania od sieci w ciągu 60 s", null)
      }
    }

    receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context, intent: Intent) {
        if (finished.get()) return
        val code = resultCode
        if (code != Activity.RESULT_OK) {
          if (finished.compareAndSet(false, true)) {
            mainHandler.removeCallbacks(timeout)
            unregister()
            promise.reject("ERR_SEND", describeError(code), null)
          }
          return
        }
        if (remaining.decrementAndGet() <= 0 && finished.compareAndSet(false, true)) {
          mainHandler.removeCallbacks(timeout)
          unregister()
          promise.resolve(mapOf("parts" to total))
        }
      }
    }

    ContextCompat.registerReceiver(appContext, receiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)

    val flags = PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
    val sentIntents = ArrayList<PendingIntent>(total)
    for (i in 0 until total) {
      val intent = Intent(action).setPackage(appContext.packageName).putExtra("part", i)
      sentIntents.add(PendingIntent.getBroadcast(appContext, action.hashCode() + i, intent, flags))
    }

    mainHandler.postDelayed(timeout, 60_000)
    try {
      if (total > 1) {
        manager.sendMultipartTextMessage(phone, null, parts, sentIntents, null)
      } else {
        manager.sendTextMessage(phone, null, message, sentIntents[0], null)
      }
    } catch (e: Exception) {
      if (finished.compareAndSet(false, true)) {
        mainHandler.removeCallbacks(timeout)
        unregister()
        promise.reject("ERR_SEND", e.message ?: "Błąd wysyłki SMS", e)
      }
    }
  }
}
