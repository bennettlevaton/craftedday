import 'package:just_audio/just_audio.dart';
import 'api_service.dart';

class MusicService {
  static final MusicService _instance = MusicService._();
  static MusicService get instance => _instance;
  MusicService._();

  AudioPlayer? _player;
  String? _currentUrl;

  bool get isPlaying => _player?.playing == true;

  Future<void> start() async {
    if (isPlaying) return;
    try {
      final url = await apiService.getRandomMusic();
      if (url == null) return;
      if (_currentUrl == url && isPlaying) return;

      await _player?.stop();
      await _player?.dispose();
      _player = AudioPlayer();
      _currentUrl = url;

      await _player!.setUrl(url);
      await _player!.setLoopMode(LoopMode.one);
      await _player!.setVolume(0.20);
      await _player!.play();
    } catch (_) {
      // Non-fatal — session continues without music
    }
  }

  Future<void> pause() async => _player?.pause();
  Future<void> resume() async => _player?.play();

  Future<void> stop() async {
    await _player?.stop();
    await _player?.dispose();
    _player = null;
    _currentUrl = null;
  }

  Future<void> setVolume(double v) async => _player?.setVolume(v);
}
