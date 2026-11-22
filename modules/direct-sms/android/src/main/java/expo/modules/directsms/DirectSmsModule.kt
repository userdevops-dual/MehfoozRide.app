package expo.modules.directsms

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
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

// Sends a text message from the phone's own SIM (SmsManager) and reports what
// Android says actually happened: "sent", or an error code. Used for SOS and
// Guardian Mode so guardians get a real SMS without any paid SMS service.
// The SEND_SMS permission must be granted first (asked from JavaScript).
class DirectSmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is not available")

  override fun definition() = ModuleDefinition {
    Name("DirectSms")

    // Can this device send SMS at all (has telephony)?
    Function("isAvailable") {
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY_MESSAGING) ||
        context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)
    }

    Function("hasPermission") {
      ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED
    }

    // Resolves { status: "sent" } or { status: "failed", reason } — never pretends.
    AsyncFunction("send") { phone: String, message: String, promise: Promise ->
      val ctx = context
      if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
        promise.resolve(mapOf("status" to "failed", "reason" to "permission_denied"))
        return@AsyncFunction
      }

      val sms: SmsManager = if (Build.VERSION.SDK_INT >= 31) ctx.getSystemService(SmsManager::class.java)
                            else @Suppress("DEPRECATION") SmsManager.getDefault()
      val parts = sms.divideMessage(message)
      val action = "expo.modules.directsms.SENT." + UUID.randomUUID()
      val done = AtomicBoolean(false)
      var remaining = parts.size
      var failure: String? = null

      val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
          if (resultCode != Activity.RESULT_OK && failure == null) failure = reasonOf(resultCode)
          remaining -= 1
          if (remaining <= 0 && done.compareAndSet(false, true)) {
            try { ctx.unregisterReceiver(this) } catch (_: Exception) {}
            promise.resolve(if (failure == null) mapOf("status" to "sent")
                            else mapOf("status" to "failed", "reason" to failure))
          }
        }
      }
      ContextCompat.registerReceiver(ctx, receiver, IntentFilter(action), ContextCompat.RECEIVER_EXPORTED)

      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      val sentIntents = ArrayList<PendingIntent>()
      for (i in parts.indices) {
        val intent = Intent(action).setPackage(ctx.packageName)
        sentIntents.add(PendingIntent.getBroadcast(ctx, (action.hashCode() + i), intent, flags))
      }

      try {
        if (parts.size == 1) sms.sendTextMessage(phone, null, message, sentIntents[0], null)
        else sms.sendMultipartTextMessage(phone, null, parts, sentIntents, null)
      } catch (e: Exception) {
        if (done.compareAndSet(false, true)) {
          try { ctx.unregisterReceiver(receiver) } catch (_: Exception) {}
          promise.resolve(mapOf("status" to "failed", "reason" to (e.message ?: "send_error")))
        }
        return@AsyncFunction
      }

      // If Android never reports back (rare), say so instead of claiming success
      Handler(Looper.getMainLooper()).postDelayed({
        if (done.compareAndSet(false, true)) {
          try { ctx.unregisterReceiver(receiver) } catch (_: Exception) {}
          promise.resolve(mapOf("status" to "unknown", "reason" to "no_confirmation"))
        }
      }, 30000)
    }
  }

  private fun reasonOf(code: Int): String = when (code) {
    SmsManager.RESULT_ERROR_NO_SERVICE -> "no_service"
    SmsManager.RESULT_ERROR_RADIO_OFF -> "radio_off"
    SmsManager.RESULT_ERROR_NULL_PDU -> "null_pdu"
    SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "generic_failure"
    else -> "error_$code"
  }
}
