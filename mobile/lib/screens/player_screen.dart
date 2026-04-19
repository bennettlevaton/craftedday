import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:just_audio/just_audio.dart';
import '../services/api_service.dart';
import '../services/music_service.dart';
import '../theme/colors.dart';

class PlayerScreen extends StatefulWidget {
  final String audioUrl;
  final String id;
  final int duration;
  final bool replay;

  const PlayerScreen({
    super.key,
    required this.audioUrl,
    required this.id,
    required this.duration,
    this.replay = false,
  });

  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen>
    with SingleTickerProviderStateMixin {
  late final AudioPlayer _player;
  late final AnimationController _breath;
  StreamSubscription<PlayerState>? _stateSub;
  bool _dragging = false;
  double _dragValue = 0;

  @override
  void initState() {
    super.initState();
    _player = AudioPlayer();
    _breath = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 5),
    )..repeat(reverse: true);
    _load();

    _stateSub = _player.playerStateStream.listen((state) {
      // Keep music in lockstep with voice playback.
      if (state.playing) {
        MusicService.instance.resume();
      } else {
        MusicService.instance.pause();
      }

      if (state.processingState == ProcessingState.completed && mounted) {
        MusicService.instance.stop();
        if (widget.replay) {
          context.pop();
        } else {
          context.go('/post-session?id=${widget.id}');
        }
      }
    });
  }

  Future<void> _load() async {
    try {
      debugPrint('[player] loading voice: ${widget.audioUrl}');
      await _player.setUrl(widget.audioUrl);
      await _player.setVolume(1.0);
      // Music already started in loading screen via MusicService singleton.
      // If this is a replay, start fresh.
      if (widget.replay) await MusicService.instance.start();
      await _player.play();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load audio. ${e.toString()}')),
      );
    }
  }

  @override
  void dispose() {
    _stateSub?.cancel();
    _player.dispose();
    _breath.dispose();
    MusicService.instance.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.close, size: 22),
          color: AppColors.textSecondary,
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Spacer(flex: 2),
              AnimatedBuilder(
                animation: _breath,
                builder: (_, __) {
                  final t = _breath.value;
                  return Container(
                    width: 220 + (t * 20),
                    height: 220 + (t * 20),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [
                          AppColors.accent.withValues(alpha: 0.25 + t * 0.1),
                          AppColors.accent.withValues(alpha: 0.05),
                        ],
                      ),
                    ),
                    child: Center(
                      child: Container(
                        width: 120 + (t * 10),
                        height: 120 + (t * 10),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.accent
                              .withValues(alpha: 0.15 + t * 0.05),
                        ),
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 48),
              StreamBuilder<Duration?>(
                stream: _player.durationStream,
                builder: (_, durationSnap) {
                  final total = durationSnap.data ??
                      Duration(seconds: widget.duration);
                  return StreamBuilder<Duration>(
                    stream: _player.positionStream,
                    builder: (_, posSnap) {
                      final pos = posSnap.data ?? Duration.zero;
                      final totalMs = total.inMilliseconds.toDouble();
                      final safeTotal = totalMs <= 0 ? 1.0 : totalMs;
                      final value = pos.inMilliseconds
                          .clamp(0, total.inMilliseconds)
                          .toDouble();

                      return Column(
                        children: [
                          SliderTheme(
                            data: SliderTheme.of(context).copyWith(
                              trackHeight: 2,
                              activeTrackColor: AppColors.accent,
                              inactiveTrackColor: AppColors.divider,
                              thumbColor: AppColors.accent,
                              overlayColor:
                                  AppColors.accent.withValues(alpha: 0.15),
                              thumbShape: const RoundSliderThumbShape(
                                enabledThumbRadius: 6,
                              ),
                              overlayShape: const RoundSliderOverlayShape(
                                overlayRadius: 16,
                              ),
                            ),
                            child: Slider(
                              min: 0,
                              max: safeTotal,
                              value: _dragging
                                  ? _dragValue.clamp(0, safeTotal)
                                  : value > safeTotal ? safeTotal : value,
                              onChangeStart: (v) => setState(() {
                                _dragging = true;
                                _dragValue = v;
                              }),
                              onChanged: (v) =>
                                  setState(() => _dragValue = v),
                              onChangeEnd: (v) {
                                setState(() => _dragging = false);
                                _player.seek(
                                  Duration(milliseconds: v.round()),
                                );
                              },
                            ),
                          ),
                          Padding(
                            padding:
                                const EdgeInsets.symmetric(horizontal: 12),
                            child: Row(
                              mainAxisAlignment:
                                  MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  _format(pos),
                                  style: textTheme.bodyMedium?.copyWith(
                                    fontFeatures: const [
                                      FontFeature.tabularFigures()
                                    ],
                                  ),
                                ),
                                Text(
                                  _format(total),
                                  style: textTheme.bodyMedium?.copyWith(
                                    fontFeatures: const [
                                      FontFeature.tabularFigures()
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      );
                    },
                  );
                },
              ),
              const Spacer(flex: 2),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _CircleButton(
                    icon: Icons.replay_10,
                    onPressed: () async {
                      final pos = _player.position;
                      await _player.seek(pos - const Duration(seconds: 10));
                    },
                  ),
                  StreamBuilder<PlayerState>(
                    stream: _player.playerStateStream,
                    builder: (_, snap) {
                      final playing = snap.data?.playing ?? false;
                      final processing =
                          snap.data?.processingState ?? ProcessingState.idle;
                      final loading = processing == ProcessingState.loading ||
                          processing == ProcessingState.buffering;

                      return Container(
                        width: 72,
                        height: 72,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.accent,
                        ),
                        child: loading
                            ? const Padding(
                                padding: EdgeInsets.all(24),
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: AppColors.surface,
                                ),
                              )
                            : IconButton(
                                icon: Icon(
                                  playing
                                      ? Icons.pause
                                      : Icons.play_arrow,
                                  size: 32,
                                ),
                                color: AppColors.surface,
                                onPressed: () async {
                                  if (playing) {
                                    await _player.pause();
                                  } else {
                                    await _player.play();
                                  }
                                },
                              ),
                      );
                    },
                  ),
                  _CircleButton(
                    icon: Icons.forward_10,
                    onPressed: () async {
                      final pos = _player.position;
                      await _player.seek(pos + const Duration(seconds: 10));
                    },
                  ),
                ],
              ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }

  String _format(Duration d) {
    final m = d.inMinutes.toString().padLeft(1, '0');
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}

class _CircleButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onPressed;

  const _CircleButton({required this.icon, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.surface,
        border: Border.all(color: AppColors.divider),
      ),
      child: IconButton(
        icon: Icon(icon, size: 22),
        color: AppColors.textPrimary,
        onPressed: onPressed,
      ),
    );
  }
}
