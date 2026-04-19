import 'package:dio/dio.dart';
import '../models/meditation.dart';

class GeneratedMeditation {
  final String id;
  final String audioUrl;
  final int duration;

  const GeneratedMeditation({
    required this.id,
    required this.audioUrl,
    required this.duration,
  });

  factory GeneratedMeditation.fromJson(Map<String, dynamic> json) {
    return GeneratedMeditation(
      id: json['id'] as String,
      audioUrl: json['audioUrl'] as String,
      duration: json['duration'] as int,
    );
  }
}

class ApiService {
  static const String _baseUrl = 'http://localhost:3000';

  final Dio _dio = Dio(
    BaseOptions(
      baseUrl: _baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 90),
    ),
  );

  Future<GeneratedMeditation> generateMeditation({
    required String prompt,
  }) async {
    final res = await _dio.post(
      '/api/meditation/generate',
      data: {'prompt': prompt},
    );
    return GeneratedMeditation.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> rateMeditation({
    required String id,
    required int rating,
    String? feedback,
  }) async {
    await _dio.post(
      '/api/meditation/$id/rate',
      data: {'rating': rating, 'feedback': feedback},
    );
  }

  Future<List<Meditation>> getHistory() async {
    final res = await _dio.get('/api/history');
    final sessions = (res.data['sessions'] as List).cast<Map<String, dynamic>>();
    return sessions.map(Meditation.fromJson).toList();
  }

  Future<Meditation> getMeditation(String id) async {
    final res = await _dio.get('/api/meditation/$id');
    return Meditation.fromJson(res.data as Map<String, dynamic>);
  }

  Future<UserStats> getStats() async {
    final res = await _dio.get('/api/stats');
    return UserStats.fromJson(res.data as Map<String, dynamic>);
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
  }) async {
    await _dio.patch(
      '/api/user/me',
      data: {
        if (name != null) 'name': name,
        if (experienceLevel != null) 'experienceLevel': experienceLevel,
        if (primaryGoals != null) 'primaryGoals': primaryGoals,
        if (primaryGoals != null) 'primaryGoalCustom': primaryGoalCustom,
        if (voiceGender != null) 'voiceGender': voiceGender,
      },
    );
  }

  Future<void> submitOnboarding({
    required String name,
    required String experienceLevel,
    required List<String> primaryGoals,
    String? primaryGoalCustom,
  }) async {
    await _dio.post(
      '/api/user/onboarding',
      data: {
        'name': name,
        'experienceLevel': experienceLevel,
        'primaryGoals': primaryGoals,
        if (primaryGoalCustom != null) 'primaryGoalCustom': primaryGoalCustom,
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

  const UserMe({
    required this.needsOnboarding,
    this.name,
    this.experienceLevel,
    this.primaryGoals = const [],
    this.primaryGoalCustom,
    required this.voiceGender,
  });

  factory UserMe.fromJson(Map<String, dynamic> json) => UserMe(
        needsOnboarding: json['needsOnboarding'] as bool,
        name: json['name'] as String?,
        experienceLevel: json['experienceLevel'] as String?,
        primaryGoals: (json['primaryGoals'] as List?)?.cast<String>() ?? const [],
        primaryGoalCustom: json['primaryGoalCustom'] as String?,
        voiceGender: (json['voiceGender'] as String?) ?? 'female',
      );

  UserMe copyWith({
    bool? needsOnboarding,
    String? name,
    String? experienceLevel,
    List<String>? primaryGoals,
    String? primaryGoalCustom,
    String? voiceGender,
  }) {
    return UserMe(
      needsOnboarding: needsOnboarding ?? this.needsOnboarding,
      name: name ?? this.name,
      experienceLevel: experienceLevel ?? this.experienceLevel,
      primaryGoals: primaryGoals ?? this.primaryGoals,
      primaryGoalCustom: primaryGoalCustom ?? this.primaryGoalCustom,
      voiceGender: voiceGender ?? this.voiceGender,
    );
  }
}

final apiService = ApiService();
