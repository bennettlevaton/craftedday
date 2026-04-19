import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:just_audio/just_audio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../services/music_service.dart';
import '../theme/colors.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

const _durationOptions = [
  (300, '5 min'),
  (600, '10 min'),
  (900, '15 min'),
  (1200, '20 min'),
  (1800, '30 min'),
];

class _HomeScreenState extends State<HomeScreen> {
  final _controller = TextEditingController();
  bool _loading = false;
  String? _name;
  int _durationSeconds = 600; // 10 min default

  @override
  void initState() {
    super.initState();
    _loadName();
    _loadDuration();
  }

  Future<void> _loadDuration() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getInt('session_duration');
    if (saved != null && mounted) setState(() => _durationSeconds = saved);
  }

  Future<void> _saveDuration(int seconds) async {
    final prefs = await SharedPreferences.getInstance();
    prefs.setInt('session_duration', seconds);
  }

  Future<void> _loadName() async {
    try {
      final me = await apiService.getMe();
      if (!mounted) return;
      setState(() => _name = me.name);
    } catch (_) {
      // No greeting by name; not critical.
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _generate() async {
    final prompt = _controller.text.trim();
    if (prompt.isEmpty || _loading) return;

    setState(() => _loading = true);
    _controller.clear();
    MusicService.instance.start(); // start music immediately, don't await
    try {
      final result = await apiService.generateMeditation(
        prompt: prompt,
        durationSeconds: _durationSeconds,
      );
      if (!mounted) return;
      context.push(
        '/player?audioUrl=${Uri.encodeComponent(result.audioUrl)}'
        '&id=${result.id}'
        '&duration=${result.duration}',
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Something went wrong. ${e.toString()}')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final greeting = _greeting();
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.history, size: 22),
          color: AppColors.textSecondary,
          onPressed: _loading ? null : () => context.push('/history'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_outline, size: 22),
            color: AppColors.textSecondary,
            onPressed: _loading ? null : () => context.push('/profile'),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Stack(
        children: [
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Spacer(flex: 2),
                  Text(
                    _name == null ? greeting : '$greeting, $_name',
                    style: textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'How are you\nfeeling today?',
                    style: textTheme.displayLarge?.copyWith(height: 1.1),
                  ),
                  const SizedBox(height: 40),
                  TextField(
                    controller: _controller,
                    autofocus: true,
                    maxLines: 5,
                    minLines: 3,
                    enabled: !_loading,
                    style: textTheme.bodyLarge,
                    decoration: const InputDecoration(
                      hintText: 'Share what\'s on your mind...',
                    ),
                    textInputAction: TextInputAction.newline,
                  ),
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerRight,
                    child: GestureDetector(
                      onTap: _loading ? null : _pickDuration,
                      behavior: HitTestBehavior.opaque,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _durationLabel(_durationSeconds),
                              style: textTheme.bodyMedium?.copyWith(
                                color: AppColors.textSecondary,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            const SizedBox(width: 2),
                            const Icon(
                              Icons.keyboard_arrow_down_rounded,
                              size: 18,
                              color: AppColors.textSecondary,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _loading ? null : _generate,
                      child: const Text('Begin meditation'),
                    ),
                  ),
                  const Spacer(flex: 3),
                ],
              ),
            ),
          ),
          if (_loading) const Positioned.fill(child: _LoadingOverlay()),
        ],
      ),
    );
  }

  String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  String _durationLabel(int seconds) {
    final opt = _durationOptions.firstWhere(
      (o) => o.$1 == seconds,
      orElse: () => _durationOptions[1],
    );
    return opt.$2;
  }

  Future<void> _pickDuration() async {
    final picked = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _DurationSheet(current: _durationSeconds),
    );
    if (picked != null && mounted) {
      setState(() => _durationSeconds = picked);
      _saveDuration(picked);
    }
  }
}

class _DurationSheet extends StatelessWidget {
  final int current;
  const _DurationSheet({required this.current});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 16),
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
            Text('Duration', style: textTheme.headlineMedium),
            const SizedBox(height: 8),
            ..._durationOptions.map((opt) {
              final selected = opt.$1 == current;
              return InkWell(
                onTap: () => Navigator.of(context).pop(opt.$1),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  child: Row(
                    children: [
                      Text(opt.$2, style: textTheme.bodyLarge),
                      const Spacer(),
                      if (selected)
                        const Icon(
                          Icons.check_rounded,
                          color: AppColors.accent,
                          size: 20,
                        ),
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class _LoadingOverlay extends StatefulWidget {
  const _LoadingOverlay();

  @override
  State<_LoadingOverlay> createState() => _LoadingOverlayState();
}

class _LoadingOverlayState extends State<_LoadingOverlay>
    with TickerProviderStateMixin {
  late final AnimationController _breathController;
  late final AnimationController _fadeController;
  AudioPlayer? _cuePlayer;
  int _cueIndex = 0;

  static const _cues = [
    'Crafting your session — begin settling in now.',
    'Find a comfortable position.',
    'Let your eyes close softly.',
    'Breathe in slowly through your nose.',
    'And let it all the way out.',
    'Feel your feet grounded beneath you.',
    'Allow your shoulders to drop.',
    'Breathe in what you need today.',
    'Breathe out whatever you\'re carrying.',
    'Let your jaw soften.',
    'Your hands, open and easy.',
    'Stay with your breath.',
    'Breathing in calm.',
    'Breathing out tension.',
    'One more slow breath in.',
    'And let it go.',
    'Your session is almost ready.',
  ];

  @override
  void initState() {
    super.initState();
    _breathController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 5),
    )..repeat(reverse: true);

    _fadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    )..value = 1;

    _initCuePlayer();
    _scheduleCue();
  }

  Future<void> _initCuePlayer() async {
    try {
      final me = await apiService.getMe();
      final gender = me.voiceGender == 'male' ? 'male' : 'female';
      _cuePlayer = AudioPlayer();
      await _cuePlayer!.setVolume(1.0);
      await _playCue(gender, 0);
    } catch (_) {
      // Non-fatal — cues play silently if audio fails
    }
  }

  Future<void> _playCue(String gender, int index) async {
    if (_cuePlayer == null || !mounted) return;
    try {
      final path =
          'assets/audio/breathing/$gender/cue_${index.toString().padLeft(2, '0')}.mp3';
      await _cuePlayer!.setAsset(path);
      await _cuePlayer!.play();
    } catch (_) {}
  }

  Future<void> _scheduleCue() async {
    String gender = 'female';
    try {
      final me = await apiService.getMe();
      gender = me.voiceGender == 'male' ? 'male' : 'female';
    } catch (_) {}

    while (mounted) {
      await Future.delayed(const Duration(seconds: 6));
      if (!mounted) return;
      await _fadeController.reverse();
      if (!mounted) return;
      final nextIndex = (_cueIndex + 1) % _cues.length;
      setState(() => _cueIndex = nextIndex);
      _fadeController.forward();
      _playCue(gender, nextIndex);
    }
  }

  @override
  void dispose() {
    _breathController.dispose();
    _fadeController.dispose();
    _cuePlayer?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Container(
      color: AppColors.background,
      child: SafeArea(
        child: Column(
          children: [
            const Spacer(flex: 2),
            AnimatedBuilder(
              animation: _breathController,
              builder: (_, __) {
                final t = _breathController.value;
                return Container(
                  width: 180 + (t * 40),
                  height: 180 + (t * 40),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        AppColors.accent.withValues(alpha: 0.20 + t * 0.12),
                        AppColors.accent.withValues(alpha: 0.03),
                      ],
                    ),
                  ),
                  child: Center(
                    child: Container(
                      width: 90 + (t * 20),
                      height: 90 + (t * 20),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.accent.withValues(alpha: 0.12 + t * 0.06),
                      ),
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 52),
            FadeTransition(
              opacity: _fadeController,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 48),
                child: Text(
                  _cues[_cueIndex],
                  textAlign: TextAlign.center,
                  style: textTheme.headlineMedium?.copyWith(
                    fontSize: 20,
                    fontWeight: FontWeight.w400,
                    height: 1.4,
                  ),
                ),
              ),
            ),
            const Spacer(flex: 3),
          ],
        ),
      ),
    );
  }
}
