import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import '../models/meditation.dart';
import 'clerk_service.dart';

class GeneratedMeditation {
  final String id;
  final String audioUrl;
  final int duration;

  const GeneratedMeditation({
    required this.id,
    required this.audioUrl,
    required this.duration,
  });

  factory GeneratedMeditation.fromDoneJob(Map<String, dynamic> json) {
    return GeneratedMeditation(
      id: json['id'] as String,
      audioUrl: json['audioUrl'] as String,
      duration: json['duration'] as int,
    );
  }
}

class MeditationFailedException implements Exception {
  const MeditationFailedException();
}

class QuotaExceededException implements Exception {
  final int minutesUsed;
  final int minutesLimit;
  final bool isTrial;
  final DateTime? periodEnd;
  const QuotaExceededException({
    required this.minutesUsed,
    required this.minutesLimit,
    this.isTrial = false,
    this.periodEnd,
  });
}

class NotSubscribedException implements Exception {
  const NotSubscribedException();
}

class UsageInfo {
  final bool subscribed;
  final bool isTrial;
  final String status;
  final int minutesUsed;
  final int minutesLimit;
  final DateTime? periodStart;
  final DateTime? periodEnd;

  const UsageInfo({
    required this.subscribed,
    required this.isTrial,
    required this.status,
    required this.minutesUsed,
    required this.minutesLimit,
    this.periodStart,
    this.periodEnd,
  });

  factory UsageInfo.fromJson(Map<String, dynamic> json) => UsageInfo(
        subscribed: (json['subscribed'] as bool?) ?? false,
        isTrial: (json['isTrial'] as bool?) ?? false,
        status: (json['status'] as String?) ?? 'inactive',
        minutesUsed: (json['minutesUsed'] as int?) ?? 0,
        minutesLimit: (json['minutesLimit'] as int?) ?? 500,
        periodStart: json['periodStart'] != null
            ? DateTime.parse(json['periodStart'] as String)
            : null,
        periodEnd: json['periodEnd'] != null
            ? DateTime.parse(json['periodEnd'] as String)
            : null,
      );

  int get minutesRemaining => (minutesLimit - minutesUsed).clamp(0, minutesLimit);
  double get usageFraction => (minutesUsed / minutesLimit).clamp(0.0, 1.0);
}

class ApiService {
  static String get _baseUrl {
    const defined = String.fromEnvironment('API_BASE_URL');
    if (defined.isNotEmpty) return defined;
    return dotenv.env['API_BASE_URL'] ?? 'http://localhost:3000';
  }

  final Dio _dio = Dio(
    BaseOptions(
      baseUrl: _baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(minutes: 15),
    ),
  )..interceptors.add(_AuthInterceptor());

  static String _clientNowIso() {
    final now = DateTime.now();
    final off = now.timeZoneOffset;
    final sign = off.isNegative ? '-' : '+';
    final h = off.inHours.abs().toString().padLeft(2, '0');
    final m = (off.inMinutes.abs() % 60).toString().padLeft(2, '0');
    return '${now.toIso8601String()}$sign$h:$m';
  }

  Future<String> enqueueMeditation({
    required String prompt,
    required int durationSeconds,
  }) async {
    try {
      final res = await _dio.post(
        '/api/meditation/generate',
        data: {
          'prompt': prompt,
          'duration': durationSeconds,
          'clientNow': _clientNowIso(),
        },
      );
      return (res.data as Map<String, dynamic>)['jobId'] as String;
    } on DioException catch (e) {
      if (e.response?.statusCode == 429) {
        final body = e.response?.data as Map<String, dynamic>? ?? {};
        final error = body['error'] as String?;
        if (error == 'quota_exceeded') {
          throw QuotaExceededException(
            minutesUsed: (body['minutesUsed'] as int?) ?? 0,
            minutesLimit: (body['minutesLimit'] as int?) ?? 150,
            isTrial: (body['isTrial'] as bool?) ?? false,
            periodEnd: body['periodEnd'] != null
                ? DateTime.tryParse(body['periodEnd'] as String)
                : null,
          );
        }
        throw const NotSubscribedException();
      }
      rethrow;
    }
  }

  Future<GeneratedMeditation> pollJobUntilDone(String jobId) async {
    const maxAttempts = 150; // ~10 min at 4s intervals
    for (var i = 0; i < maxAttempts; i++) {
      await Future.delayed(const Duration(seconds: 4));
      final res = await _dio.get('/api/meditation/jobs/$jobId');
      final data = res.data as Map<String, dynamic>;
      final status = data['status'] as String;
      if (status == 'done') return GeneratedMeditation.fromDoneJob(data);
      if (status == 'failed') throw const MeditationFailedException();
    }
    throw TimeoutException('Meditation generation timed out', const Duration(minutes: 10));
  }

  Future<CheckinResult> submitCheckin({
    required String id,
    required String feeling,
    List<String> whatHelped = const [],
    String? feedback,
  }) async {
    final res = await _dio.post(
      '/api/meditation/$id/checkin',
      data: {
        'feeling': feeling,
        if (whatHelped.isNotEmpty) 'whatHelped': whatHelped,
        if (feedback != null) 'feedback': feedback,
      },
    );
    return CheckinResult.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> logListen({
    required String id,
    required int listenedSeconds,
    required bool completed,
  }) async {
    try {
      await _dio.post(
        '/api/meditation/$id/listen',
        data: {
          'listenedSeconds': listenedSeconds,
          'completed': completed,
        },
      );
    } catch (_) {
      // Non-critical — streak just won't credit this listen.
    }
  }

  Future<List<Meditation>> getHistory() async {
    final res = await _dio.get('/api/history');
    final sessions = (res.data['sessions'] as List).cast<Map<String, dynamic>>();
    return sessions.map(Meditation.fromJson).toList();
  }

  Future<List<Meditation>> getFavorites() async {
    final res = await _dio.get('/api/favorites');
    final sessions = (res.data['sessions'] as List).cast<Map<String, dynamic>>();
    return sessions.map(Meditation.fromJson).toList();
  }

  Future<bool> toggleFavorite(String id) async {
    final res = await _dio.post('/api/meditation/$id/favorite');
    return res.data['isFavorite'] as bool;
  }

  Future<Meditation> getMeditation(String id) async {
    final res = await _dio.get('/api/meditation/$id');
    return Meditation.fromJson(res.data as Map<String, dynamic>);
  }

  Future<UserStats> getStats() async {
    final res = await _dio.get('/api/stats');
    return UserStats.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>?> getDailySession() async {
    final res = await _dio.get('/api/session/daily');
    return res.data['session'] as Map<String, dynamic>?;
  }

  Future<String?> getRandomMusic() async {
    final res = await _dio.get('/api/music/random');
    return res.data['url'] as String?;
  }

  Future<UserMe> getMe() async {
    final res = await _dio.get('/api/user/me');
    return UserMe.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> updateProfile({
    String? name,
    String? experienceLevel,
    List<String>? primaryGoals,
    String? primaryGoalCustom,
    String? voiceGender,
    int? notificationHour,
  }) async {
    await _dio.patch(
      '/api/user/me',
      data: {
        if (name != null) 'name': name,
        if (experienceLevel != null) 'experienceLevel': experienceLevel,
        if (primaryGoals != null) 'primaryGoals': primaryGoals,
        if (primaryGoals != null) 'primaryGoalCustom': primaryGoalCustom,
        if (voiceGender != null) 'voiceGender': voiceGender,
        if (notificationHour != null) 'notificationHour': notificationHour,
      },
    );
  }

  Future<UsageInfo?> getUsage() async {
    try {
      final res = await _dio.get('/api/usage');
      return UsageInfo.fromJson(res.data as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> submitOnboarding({
    required String name,
    required String experienceLevel,
    required List<String> primaryGoals,
    String? primaryGoalCustom,
    int? notificationHour,
  }) async {
    await _dio.post(
      '/api/user/onboarding',
      data: {
        'name': name,
        'experienceLevel': experienceLevel,
        'primaryGoals': primaryGoals,
        if (primaryGoalCustom != null) 'primaryGoalCustom': primaryGoalCustom,
        if (notificationHour != null) 'notificationHour': notificationHour,
      },
    );
  }
}

class UserMe {
  final bool needsOnboarding;
  final String? name;
  final String? experienceLevel;
  final List<String> primaryGoals;
  final String? primaryGoalCustom;
  final String voiceGender;
  final int notificationHour;

  const UserMe({
    required this.needsOnboarding,
    this.name,
    this.experienceLevel,
    this.primaryGoals = const [],
    this.primaryGoalCustom,
    required this.voiceGender,
    this.notificationHour = 8,
  });

  factory UserMe.fromJson(Map<String, dynamic> json) => UserMe(
        needsOnboarding: json['needsOnboarding'] as bool,
        name: json['name'] as String?,
        experienceLevel: json['experienceLevel'] as String?,
        primaryGoals: (json['primaryGoals'] as List?)?.cast<String>() ?? const [],
        primaryGoalCustom: json['primaryGoalCustom'] as String?,
        voiceGender: (json['voiceGender'] as String?) ?? 'female',
        notificationHour: (json['notificationHour'] as int?) ?? 8,
      );

  UserMe copyWith({
    bool? needsOnboarding,
    String? name,
    String? experienceLevel,
    List<String>? primaryGoals,
    String? primaryGoalCustom,
    String? voiceGender,
    int? notificationHour,
  }) {
    return UserMe(
      needsOnboarding: needsOnboarding ?? this.needsOnboarding,
      name: name ?? this.name,
      experienceLevel: experienceLevel ?? this.experienceLevel,
      primaryGoals: primaryGoals ?? this.primaryGoals,
      primaryGoalCustom: primaryGoalCustom ?? this.primaryGoalCustom,
      voiceGender: voiceGender ?? this.voiceGender,
      notificationHour: notificationHour ?? this.notificationHour,
    );
  }
}

final apiService = ApiService();

class _AuthInterceptor extends Interceptor {
  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await ClerkService.instance.getToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }
}
