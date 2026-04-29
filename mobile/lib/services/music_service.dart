import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'api_service.dart';

// Uses `audioplayers` (not `just_audio`) because `just_audio_background`
// claims the singleton background-audio session for the voice player. A
// second `just_audio` AudioPlayer silently fails to play. `audioplayers`
// runs on a separate native engine and mixes alongside fine.
class MusicService {
  static final MusicService _instance = MusicService._();
  static MusicService get instance => _instance;
  MusicService._();

  AudioPlayer? _player;
  String? _currentUrl;
  bool _playing = false;

  bool get isPlaying => _playing;

  Future<void> start() async {
    if (_playing) return;
    try {
      final url = await apiService.getRandomMusic();
      if (url == null) {
        debugPrint('MusicService: /api/music/random returned no URL');
        return;
      }

      await _player?.stop();
      await _player?.dispose();
      _player = AudioPlayer();
      _currentUrl = url;

      await _player!.setReleaseMode(ReleaseMode.loop);
      await _player!.setVolume(0.20);
      await _player!.play(UrlSource(url));
      _playing = true;
    } catch (e) {
      debugPrint('MusicService.start failed: $e');
    }
  }

  Future<void> pause() async {
    if (_player == null) return;
    await _player!.pause();
    _playing = false;
  }

  Future<void> resume() async {
    if (_player == null || _currentUrl == null) return;
    await _player!.resume();
    _playing = true;
  }

  Future<void> stop() async {
    await _player?.stop();
    await _player?.dispose();
    _player = null;
    _currentUrl = null;
    _playing = false;
  }

  Future<void> setVolume(double v) async => _player?.setVolume(v);
}
