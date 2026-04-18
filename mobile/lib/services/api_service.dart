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

  Future<String> getVoiceGender() async {
    final res = await _dio.get('/api/user/preferences');
    return (res.data['voiceGender'] as String?) ?? 'female';
  }

  Future<void> setVoiceGender(String voiceGender) async {
    await _dio.patch(
      '/api/user/preferences',
      data: {'voiceGender': voiceGender},
    );
  }
}

final apiService = ApiService();
