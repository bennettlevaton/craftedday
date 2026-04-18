import 'package:dio/dio.dart';

class ApiService {
  final Dio _dio;

  ApiService({required String baseUrl})
      : _dio = Dio(BaseOptions(baseUrl: baseUrl));

  Future<String> generateMeditation(String prompt, String authToken) async {
    // TODO: implement
    throw UnimplementedError();
  }

  Future<List<dynamic>> getHistory(String authToken) async {
    // TODO: implement
    throw UnimplementedError();
  }
}
