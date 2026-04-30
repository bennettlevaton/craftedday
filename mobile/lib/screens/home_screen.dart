import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:just_audio/just_audio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import '../models/meditation.dart';
import '../services/api_service.dart';
import '../services/music_service.dart';
import '../services/notification_service.dart';
import '../services/support_service.dart';
import '../theme/colors.dart';
import 'package:intl/intl.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

const _durationOptions = [
  (300, '5 min'),
  (600, '10 min'),
];

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  final _controller = TextEditingController();
  bool _loading = false;
  String? _name;
  List<String> _goals = const [];
  int _durationSeconds = 300;
  Map<String, dynamic>? _dailySession; // 10 min default
  UserStats? _stats;
  Timer? _abandonTimer;
  bool _abandoned = false;
  GoRouter? _goRouter;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadDuration();
    _loadHome();
  }

  // One round-trip for me + stats + daily, then schedule notifications using
  // the same `me` payload (no second /me call).
  Future<void> _loadHome() async {
    final home = await apiService.getHome();
    if (home != null) {
      if (mounted) {
        setState(() {
          _name = home.me.name;
          _goals = home.me.primaryGoals;
          _stats = home.stats;
          if (home.daily != null) _dailySession = home.daily;
        });
      }
      await _setupNotificationsWithHour(home.me.notificationHour);
      return;
    }
    // Combined endpoint failed (older server / network) — fall back to the
    // three individual endpoints.
    _loadName();
    _loadStats();
    _loadDailySession();
    _setupNotifications();
  }

  Future<void> _setupNotificationsWithHour(int hour) async {
    final granted = await NotificationService.instance.requestPermission();
    if (!granted) return;
    await NotificationService.instance.scheduleIfNeeded(hour: hour);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final router = GoRouter.of(context);
    if (_goRouter != router) {
      _goRouter?.routerDelegate.removeListener(_handleRouterChanged);
      _goRouter = router;
      _goRouter!.routerDelegate.addListener(_handleRouterChanged);
    }
  }

  // Fired on every GoRouter navigation. Refresh data whenever home becomes
  // the active route (e.g. returning from post-session or history).
  void _handleRouterChanged() {
    if (!mounted || _loading) return;
    final location =
        _goRouter?.routerDelegate.currentConfiguration.uri.path;
    if (location == '/home') {
      _refreshHome();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // App returning from background can be stale — daily card may have rolled
    // over and the streak may have advanced since we last fetched.
    if (state == AppLifecycleState.resumed && mounted && !_loading) {
      _refreshHome();
    }
  }

  // Like _loadHome but skips the notification setup (already scheduled on
  // initial load) and the fallback chain (best-effort refresh).
  Future<void> _refreshHome() async {
    final home = await apiService.getHome();
    if (home == null || !mounted) return;
    setState(() {
      _name = home.me.name;
      _goals = home.me.primaryGoals;
      _stats = home.stats;
      if (home.daily != null) _dailySession = home.daily;
    });
  }

  Future<void> _loadStats() async {
    try {
      final stats = await apiService.getStats();
      if (mounted) setState(() => _stats = stats);
    } catch (_) {
      // Non-critical — streak just won't show.
    }
  }

  Future<void> _setupNotifications() async {
    final granted = await NotificationService.instance.requestPermission();
    if (!granted) return;
    int hour = 8;
    try {
      final me = await apiService.getMe();
      hour = me.notificationHour;
    } catch (_) {
      // Default to 8am if profile fetch fails.
    }
    await NotificationService.instance.scheduleIfNeeded(hour: hour);
  }

  Future<void> _loadDailySession() async {
    try {
      final session = await apiService.getDailySession();
      if (mounted && session != null) {
        setState(() => _dailySession = session);
      }
    } catch (_) {
      // Silent — card just won't show
    }
  }

  void _startDailySession() {
    final s = _dailySession;
    if (s == null) return;
    // If already checked in, treat as replay (no post-session prompt)
    final alreadyCheckedIn = s['feeling'] != null;
    final title = s['title'] as String?;
    context.push(
      '/player?audioUrl=${Uri.encodeComponent(s['audioUrl'] as String)}'
      '&id=${s['id']}'
      '&duration=${s['duration'] ?? 600}'
      '${title != null ? '&title=${Uri.encodeComponent(title)}' : ''}'
      '${alreadyCheckedIn ? '&replay=1' : ''}',
    );
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
      setState(() {
        _name = me.name;
        _goals = me.primaryGoals;
      });
    } catch (_) {
      // No greeting by name; not critical.
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _goRouter?.routerDelegate.removeListener(_handleRouterChanged);
    _abandonTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _abandonLoading() {
    if (!_loading || _abandoned) return;
    _abandoned = true;
    _abandonTimer?.cancel();
    MusicService.instance.stop();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          "Still preparing — it'll appear in History when it's ready.",
        ),
      ),
    );
    setState(() => _loading = false);
  }

  Future<void> _generate() async {
    final prompt = _controller.text.trim();
    if (prompt.isEmpty || _loading) return;

    _abandoned = false;
    FocusScope.of(context).unfocus();
    setState(() => _loading = true);
    _controller.clear();
    MusicService.instance.start();
    _abandonTimer?.cancel();
    _abandonTimer = Timer(const Duration(seconds: 90), _abandonLoading);
    try {
      final jobId = await apiService.enqueueMeditation(
        prompt: prompt,
        durationSeconds: _durationSeconds,
      );
      if (!mounted || _abandoned) return;
      final result = await apiService.pollJobUntilDone(jobId);
      if (!mounted || _abandoned) return;
      context.push(
        '/player?audioUrl=${Uri.encodeComponent(result.audioUrl)}'
        '&id=${result.id}'
        '&duration=${result.duration}'
        '${result.title != null ? '&title=${Uri.encodeComponent(result.title!)}' : ''}',
      );
    } on QuotaExceededException catch (e) {
      MusicService.instance.stop();
      if (!mounted || _abandoned) return;
      _showQuotaSheet(e);
    } on NotSubscribedException catch (_) {
      MusicService.instance.stop();
      if (!mounted || _abandoned) return;
      context.push('/paywall');
    } on MeditationFailedException catch (_) {
      MusicService.instance.stop();
      if (!mounted || _abandoned) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("We couldn't prepare your session this time. Please try again.")),
      );
    } catch (_) {
      MusicService.instance.stop();
      if (!mounted || _abandoned) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Something didn't go as planned. Please try again.")),
      );
    } finally {
      _abandonTimer?.cancel();
      if (mounted && !_abandoned) setState(() => _loading = false);
    }
  }

  void _showQuotaSheet(QuotaExceededException e) {
    if (!mounted) return;
    final String title;
    final String body;

    if (e.isTrial) {
      title = "You've reached your trial limit.";
      body = e.periodEnd != null
          ? 'Your full 150 minutes unlock on ${DateFormat('MMMM d').format(e.periodEnd!)} when your subscription begins.'
          : 'Your full 150 minutes unlock when your trial converts.';
    } else {
      title = "You've used all your minutes this month.";
      body = e.periodEnd != null
          ? 'Your next 150 minutes unlock on ${DateFormat('MMMM d').format(e.periodEnd!)}.'
          : 'Your minutes reset at the start of your next billing cycle.';
    }

    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(28, 20, 28, 28),
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
              const SizedBox(height: 24),
              Text(
                title,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 10),
              Text(
                body,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 28),
              FilledButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Got it'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final greeting = _greeting();
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: _loading
          ? null
          : AppBar(
              leading: IconButton(
                icon: const Icon(Icons.history, size: 22),
                color: AppColors.textSecondary,
                onPressed: () => context.push('/history'),
              ),
              actions: [
                IconButton(
                  icon: const Icon(Icons.support_outlined, size: 22),
                  color: AppColors.textSecondary,
                  tooltip: 'Contact support',
                  onPressed: () => SupportService.open(
                    context: context,
                    subject: 'CraftedDay support',
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.person_outline, size: 22),
                  color: AppColors.textSecondary,
                  onPressed: () => context.push('/profile'),
                ),
                const SizedBox(width: 8),
              ],
            ),
      body: _loading
          ? _LoadingOverlay(onDismiss: _abandonLoading)
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 28),
                child: SingleChildScrollView(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                  const SizedBox(height: 40),
                  if (_dailySession != null &&
                      _dailySession!['feeling'] == null) ...[
                    _DailySessionCard(
                      onTap: _startDailySession,
                      durationSeconds:
                          (_dailySession!['duration'] as int?) ?? 600,
                    ),
                    const SizedBox(height: 28),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            _name == null ? greeting : '$greeting, $_name',
                            style: textTheme.bodyMedium?.copyWith(
                              color: AppColors.textSecondary,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        if (_stats != null && _stats!.streak >= 1)
                          _StreakChip(streak: _stats!.streak),
                      ],
                    ),
                  ] else ...[
                    if (_stats != null && _stats!.streak >= 1) ...[
                      _StreakHeroCard(streak: _stats!.streak),
                      const SizedBox(height: 28),
                    ],
                    Text(
                      _name == null ? greeting : '$greeting, $_name',
                      style: textTheme.bodyMedium?.copyWith(
                        color: AppColors.textSecondary,
                        fontSize: 15,
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  Text(
                    'How are you\nfeeling today?',
                    style: textTheme.displayLarge?.copyWith(height: 1.1),
                  ),
                  const SizedBox(height: 40),
                  TextField(
                    controller: _controller,
                    autofocus: false,
                    maxLines: 5,
                    minLines: 3,
                    maxLength: 200,
                    enabled: !_loading,
                    style: textTheme.bodyLarge,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(
                      hintText: _hintForGoals(_goals),
                      counterText: '',
                    ),
                    textInputAction: TextInputAction.done,
                    inputFormatters: [
                      FilteringTextInputFormatter.deny(RegExp(r'\n')),
                    ],
                    onSubmitted: (_) => FocusScope.of(context).unfocus(),
                    scrollPadding: const EdgeInsets.fromLTRB(0, 0, 0, 220),
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
                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
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

String _hintForGoals(List<String> goals) {
  final primary = goals.isEmpty ? null : goals.first;
  return switch (primary) {
    'stress' => 'Something stressing you out?',
    'sleep' => 'Hard time winding down?',
    'focus' => 'Need to settle and focus?',
    'anxiety' => 'Feeling anxious? Start here.',
    'general' => 'What\'s on your mind?',
    _ => 'Share what\'s on your mind...',
  };
}

class _StreakChip extends StatelessWidget {
  final int streak;
  const _StreakChip({required this.streak});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final label = streak == 1 ? '1 day' : '$streak days';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(100),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.local_fire_department_rounded,
            size: 14,
            color: AppColors.accent,
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: textTheme.bodyMedium?.copyWith(
              color: AppColors.accent,
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

class _StreakHeroCard extends StatelessWidget {
  final int streak;
  const _StreakHeroCard({required this.streak});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final dayWord = streak == 1 ? 'day' : 'days';
    final subtitle = _streakSubtitle(streak);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppColors.accent.withValues(alpha: 0.20),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.accent.withValues(alpha: 0.15),
            ),
            child: const Icon(
              Icons.local_fire_department_rounded,
              size: 22,
              color: AppColors.accent,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$streak $dayWord running',
                  style: textTheme.headlineMedium?.copyWith(
                    fontSize: 17,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: textTheme.bodyMedium?.copyWith(
                    color: AppColors.textSecondary,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _streakSubtitle(int streak) {
    if (streak == 1) return 'A start. Come back tomorrow to make it two.';
    if (streak < 5) return "Don't break the chain.";
    if (streak < 7) return 'Almost a full week. Keep going.';
    if (streak < 14) return "You're becoming someone who shows up.";
    if (streak < 30) return "This isn't a habit anymore — it's a practice.";
    return 'A month of presence. Quietly, this changes things.';
  }
}

class _DailySessionCard extends StatelessWidget {
  final VoidCallback onTap;
  final int durationSeconds;
  const _DailySessionCard({
    required this.onTap,
    required this.durationSeconds,
  });

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final minutes = (durationSeconds / 60).round();
    final subtitle = '$minutes min';
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.accent.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppColors.accent.withValues(alpha: 0.25),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Today\'s meditation',
                    style: textTheme.headlineMedium?.copyWith(fontSize: 16),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: textTheme.bodyMedium,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.accent,
              ),
              child: const Icon(
                Icons.play_arrow_rounded,
                color: AppColors.surface,
                size: 22,
              ),
            ),
          ],
        ),
      ),
    );
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
  final VoidCallback onDismiss;
  const _LoadingOverlay({required this.onDismiss});

  @override
  State<_LoadingOverlay> createState() => _LoadingOverlayState();
}

class _LoadingOverlayState extends State<_LoadingOverlay>
    with TickerProviderStateMixin {
  late final AnimationController _breathController;
  late final AnimationController _fadeController;
  final AudioPlayer _cuePlayer = AudioPlayer();
  // Default to female — matches the app default and lets cue 0 fire
  // immediately without waiting on /api/user/me. Updated lazily if the
  // user is on the (currently hidden) male toggle.
  String _gender = 'female';
  int _cueIndex = 0;
  bool _disposed = false;

  static const _cues = [
    'Settling in — your session is on its way.',
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

    // Generation can take 30s+; without this iOS will dim/lock the screen
    // mid-load and the user comes back to a black phone.
    WakelockPlus.enable();

    _cuePlayer.setVolume(1.0);
    _playCue(0);
    _resolveGender();
    _scheduleCues();
  }

  Future<void> _resolveGender() async {
    try {
      final me = await apiService.getMe();
      if (_disposed) return;
      final resolved = me.voiceGender == 'male' ? 'male' : 'female';
      if (resolved != _gender) _gender = resolved;
    } catch (_) {
      // Stay on the female default — the assets always exist for it.
    }
  }

  Future<void> _playCue(int index) async {
    if (_disposed) return;
    try {
      final path =
          'assets/audio/breathing/$_gender/cue_${index.toString().padLeft(2, '0')}.mp3';
      await _cuePlayer.setAsset(path);
      if (_disposed) return;
      await _cuePlayer.play();
    } catch (e) {
      debugPrint('Loading cue failed (index $index): $e');
    }
  }

  Future<void> _scheduleCues() async {
    while (!_disposed && mounted) {
      await Future.delayed(const Duration(seconds: 6));
      if (_disposed || !mounted) return;
      await _fadeController.reverse();
      if (_disposed || !mounted) return;
      final nextIndex = (_cueIndex + 1) % _cues.length;
      setState(() => _cueIndex = nextIndex);
      _fadeController.forward();
      _playCue(nextIndex);
    }
  }

  @override
  void dispose() {
    _disposed = true;
    WakelockPlus.disable();
    _breathController.dispose();
    _fadeController.dispose();
    _cuePlayer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Container(
      color: AppColors.background,
      child: SafeArea(
        child: Stack(
          children: [
            Align(
              alignment: Alignment.topRight,
              child: IconButton(
                icon: const Icon(Icons.close_rounded, size: 22),
                color: AppColors.textSecondary,
                onPressed: widget.onDismiss,
              ),
            ),
            Column(
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
            SizedBox(
              width: double.infinity,
              height: 80,
              child: FadeTransition(
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
            ),
            const Spacer(flex: 3),
          ],
            ),
          ],
        ),
      ),
    );
  }
}
