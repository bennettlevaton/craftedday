import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:just_audio/just_audio.dart';
import 'package:just_audio_background/just_audio_background.dart';
import '../services/api_service.dart';
import '../services/music_service.dart';
import '../services/notification_service.dart';
import '../services/support_service.dart';
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
  bool _loadFailed = false;
  bool _retrying = false;
  bool _navigated = false;

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

      if (state.processingState == ProcessingState.completed &&
          mounted &&
          !_navigated) {
        _navigated = true;
        MusicService.instance.stop();
        apiService.logListen(
          id: widget.id,
          listenedSeconds: widget.duration,
          completed: true,
        );
        if (widget.replay) {
          context.pop();
        } else {
          NotificationService.instance.markSessionCompletedToday();
          context.go('/post-session?id=${widget.id}');
        }
      }
    });
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loadFailed = false;
        _retrying = true;
      });
    }
    try {
      // The MediaItem tag is what hooks this player into iOS Now Playing /
      // Android media notification — without it, lock-screen controls don't
      // appear. Only the voice player carries a tag; the music player stays
      // tagless so the system surfaces a single set of controls.
      await _player.setAudioSource(
        AudioSource.uri(
          Uri.parse(widget.audioUrl),
          tag: MediaItem(
            id: widget.id,
            album: 'CraftedDay',
            title: 'Meditation',
            artist: 'CraftedDay',
          ),
        ),
      );
      await _player.setVolume(1.0);
      if (!MusicService.instance.isPlaying) {
        MusicService.instance.start();
      }
      if (mounted) setState(() => _retrying = false);
      // Brief pause before voice starts — lets listeners settle in.
      await Future.delayed(const Duration(seconds: 3));
      if (!mounted) return;
      await _player.play();
    } catch (_) {
      MusicService.instance.stop();
      if (!mounted) return;
      setState(() {
        _loadFailed = true;
        _retrying = false;
      });
    }
  }

  // If the user bails before ~70% of the session, check in. Past that we
  // assume they got enough out of it and close silently.
  Future<void> _handleClose() async {
    if (_navigated) return;
    _navigated = true;

    final pos = _player.position.inSeconds;
    final total = widget.duration;
    final finishedEnough = total > 0 && pos / total >= 0.7;

    if (!_loadFailed && pos > 0) {
      apiService.logListen(
        id: widget.id,
        listenedSeconds: pos,
        completed: finishedEnough,
      );
    }

    if (_loadFailed || !finishedEnough) {
      final reason = await showModalBottomSheet<_ExitReason>(
        context: context,
        backgroundColor: AppColors.background,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        builder: (_) => const _EarlyExitSheet(),
      );
      if (!mounted) return;

      switch (reason) {
        case _ExitReason.somethingOff:
          await SupportService.open(
            context: context,
            subject: 'Something felt off in my session',
            meditationId: widget.id,
            note: 'Hi — something felt off about this session:',
          );
          break;
        case _ExitReason.audio:
          await SupportService.open(
            context: context,
            subject: 'Audio problem during session',
            meditationId: widget.id,
            note: 'Hi — I hit an audio problem during this session:',
          );
          break;
        case _ExitReason.stopped:
        case null:
          break;
      }
    }

    if (mounted) context.pop();
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
          onPressed: _handleClose,
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: _loadFailed
              ? _ErrorView(retrying: _retrying, onRetry: _load)
              : Column(
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

class _ErrorView extends StatelessWidget {
  final bool retrying;
  final VoidCallback onRetry;
  const _ErrorView({required this.retrying, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const Spacer(flex: 2),
        Icon(
          Icons.cloud_off_rounded,
          size: 48,
          color: AppColors.textSecondary.withValues(alpha: 0.6),
        ),
        const SizedBox(height: 20),
        Text(
          "Couldn't load session",
          style: textTheme.headlineMedium,
        ),
        const SizedBox(height: 8),
        Text(
          'Check your connection and try again.',
          style: textTheme.bodyMedium?.copyWith(
            color: AppColors.textSecondary,
          ),
          textAlign: TextAlign.center,
        ),
        const Spacer(flex: 3),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: retrying ? null : onRetry,
            child: retrying
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.surface,
                    ),
                  )
                : const Text('Retry'),
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }
}

enum _ExitReason { stopped, somethingOff, audio }

class _EarlyExitSheet extends StatelessWidget {
  const _EarlyExitSheet();

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.divider,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text('Taking a break?', style: textTheme.headlineMedium),
            const SizedBox(height: 8),
            Text(
              "Help us understand what didn't work.",
              style: textTheme.bodyMedium?.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 20),
            _ExitRow(
              label: 'Just needed to stop',
              onTap: () => Navigator.of(context).pop(_ExitReason.stopped),
            ),
            _ExitRow(
              label: 'Something felt off',
              trailing: 'Contact us',
              onTap: () =>
                  Navigator.of(context).pop(_ExitReason.somethingOff),
            ),
            _ExitRow(
              label: 'Audio problem',
              trailing: 'Contact us',
              onTap: () => Navigator.of(context).pop(_ExitReason.audio),
            ),
          ],
        ),
      ),
    );
  }
}

class _ExitRow extends StatelessWidget {
  final String label;
  final String? trailing;
  final VoidCallback onTap;

  const _ExitRow({
    required this.label,
    required this.onTap,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 4),
        child: Row(
          children: [
            Expanded(
              child: Text(label, style: textTheme.bodyLarge),
            ),
            if (trailing != null) ...[
              Text(
                trailing!,
                style: textTheme.bodyMedium?.copyWith(
                  color: AppColors.accent,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(width: 8),
            ],
            const Icon(
              Icons.chevron_right_rounded,
              color: AppColors.textSecondary,
              size: 20,
            ),
          ],
        ),
      ),
    );
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
