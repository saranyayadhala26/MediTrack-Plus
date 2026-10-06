package com.meditrack.plus.alarm

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExactAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExactAlarmModule")

    Function("canScheduleExactAlarms") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val context = appContext.reactContext ?: return@Function false
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
        alarmManager?.canScheduleExactAlarms() ?: false
      } else {
        true
      }
    }

    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val context = appContext.reactContext ?: return@Function false
        try {
          val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
            data = Uri.fromParts("package", context.packageName, null)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          context.startActivity(intent)
          true
        } catch (_: Exception) {
          try {
            val fallbackIntent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
              data = Uri.fromParts("package", context.packageName, null)
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(fallbackIntent)
            true
          } catch (_: Exception) {
            false
          }
        }
      } else {
        false
      }
    }
  }
}
