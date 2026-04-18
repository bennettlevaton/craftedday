import 'package:dio/dio.dart';

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
    String voiceGender = 'female',
  }) async {
    final res = await _dio.post(
      '/api/meditation/generate',
      data: {'prompt': prompt, 'voiceGender': voiceGender},
    );
    return GeneratedMeditation.fromJson(res.data as Map<String, dynamic>);
  }
}

final apiService = ApiService();
