import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest_all.dart' as tz;
import 'package:timezone/timezone.dart' as tz;

class NotificationService {
  static final NotificationService instance = NotificationService._();
  NotificationService._();

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  static const _notificationId = 1;
  static const _lastSessionKey = 'last_session_date';
  static const _hourKey = 'notification_hour';

  Future<void> initialize() async {
    if (_initialized) return;
    tz.initializeTimeZones();
    // tz.initializeTimeZones() loads the IANA database but leaves tz.local at
    // UTC. Without setting it explicitly, tz.TZDateTime(tz.local, ...) below
    // would schedule notifications in UTC — e.g. 8am UTC = midnight PT.
    try {
      final name = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(name));
    } catch (_) {
      // Fall back to UTC if detection fails — better than crashing.
    }
    const ios = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _plugin.initialize(const InitializationSettings(iOS: ios));
    _initialized = true;
  }

  Future<bool> requestPermission() async {
    final result = await _plugin
        .resolvePlatformSpecificImplementation<
            IOSFlutterLocalNotificationsPlugin>()
        ?.requestPermissions(alert: true, badge: false, sound: true);
    return result ?? false;
  }

  // Call this when a meditation session completes. Cancels today's reminder
  // and reschedules the recurring notification starting tomorrow — iOS can't
  // skip a single occurrence of a repeating trigger, so we rebuild it.
  Future<void> markSessionCompletedToday() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastSessionKey, _todayKey());
    final hour = prefs.getInt(_hourKey) ?? 8;
    await _scheduleStartingTomorrow(hour);
  }

  Future<bool> _didSessionToday() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_lastSessionKey) == _todayKey();
  }

  String _todayKey() => DateTime.now().toIso8601String().slice(0, 10);

  Future<void> scheduleIfNeeded({int hour = 8}) async {
    await initialize();
    final clamped = (hour < 0 || hour > 23) ? 8 : hour;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_hourKey, clamped);

    // If they already meditated today, start the recurring schedule tomorrow
    // so we don't ping them again today.
    final startTomorrow = await _didSessionToday();
    await _scheduleAt(clamped, startTomorrow: startTomorrow);
  }

  Future<void> _scheduleStartingTomorrow(int hour) async {
    await initialize();
    final clamped = (hour < 0 || hour > 23) ? 8 : hour;
    await _scheduleAt(clamped, startTomorrow: true);
  }

  Future<void> _scheduleAt(int hour, {required bool startTomorrow}) async {
    await _plugin.cancel(_notificationId);

    final now = tz.TZDateTime.now(tz.local);
    var scheduled = tz.TZDateTime(tz.local, now.year, now.month, now.day, hour);
    if (startTomorrow || !scheduled.isAfter(now)) {
      scheduled = tz.TZDateTime(tz.local, now.year, now.month, now.day, hour)
          .add(const Duration(days: 1));
    }

    await _plugin.zonedSchedule(
      _notificationId,
      'CraftedDay',
      'Time for your daily reset.',
      scheduled,
      const NotificationDetails(
        iOS: DarwinNotificationDetails(),
      ),
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      uiLocalNotificationDateInterpretation:
          UILocalNotificationDateInterpretation.absoluteTime,
      matchDateTimeComponents: DateTimeComponents.time,
    );
  }

  Future<void> cancel() async => _plugin.cancel(_notificationId);
}

extension on String {
  String slice(int start, int end) => substring(start, end);
}
