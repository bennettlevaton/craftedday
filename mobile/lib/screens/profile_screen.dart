import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../models/meditation.dart';
import '../services/api_service.dart';
import '../theme/colors.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  UserStats? _stats;
  UserMe? _me;
  UsageInfo? _usage;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        apiService.getStats(),
        apiService.getMe(),
        apiService.getUsage(),
      ]);
      if (!mounted) return;
      setState(() {
        _stats = results[0] as UserStats;
        _me = results[1] as UserMe;
        _usage = results[2] as UsageInfo?;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _editName() async {
    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _NameSheet(initial: _me?.name ?? ''),
    );
    if (result == null) return;
    await _persist(() => apiService.updateProfile(name: result));
    if (mounted) setState(() => _me = _me?.copyWith(name: result));
  }

  Future<void> _editExperience() async {
    final result = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _ExperienceSheet(initial: _me?.experienceLevel),
    );
    if (result == null) return;
    await _persist(() => apiService.updateProfile(experienceLevel: result));
    if (mounted) {
      setState(() => _me = _me?.copyWith(experienceLevel: result));
    }
  }

  Future<void> _editGoals() async {
    final result = await showModalBottomSheet<_GoalsResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _GoalsSheet(
        initialGoals: _me?.primaryGoals ?? const [],
        initialCustom: _me?.primaryGoalCustom ?? '',
      ),
    );
    if (result == null) return;
    await _persist(() => apiService.updateProfile(
          primaryGoals: result.goals,
          primaryGoalCustom: result.custom,
        ));
    if (mounted) {
      setState(() => _me = _me?.copyWith(
            primaryGoals: result.goals,
            primaryGoalCustom: result.custom,
          ));
    }
  }

  Future<void> _editVoice() async {
    final result = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _VoiceSheet(initial: _me?.voiceGender ?? 'female'),
    );
    if (result == null) return;
    await _persist(() => apiService.updateProfile(voiceGender: result));
    if (mounted) setState(() => _me = _me?.copyWith(voiceGender: result));
  }

  Future<void> _editNotificationHour() async {
    final result = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _NotificationHourSheet(initial: _me?.notificationHour ?? 8),
    );
    if (result == null) return;
    await _persist(() => apiService.updateProfile(notificationHour: result));
    if (mounted) setState(() => _me = _me?.copyWith(notificationHour: result));
  }

  Future<void> _persist(Future<void> Function() action) async {
    try {
      await action();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("We couldn't save that change. Please try again.")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final stats = _stats;
    final me = _me;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, size: 22),
          color: AppColors.textSecondary,
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          children: [
            const SizedBox(height: 8),
            Text('Profile', style: textTheme.displayMedium),
            const SizedBox(height: 32),
            _SectionLabel(text: 'Stats'),
            const SizedBox(height: 4),
            if (_loading) ...[
              const _StatRowSkeleton(labelWidth: 110, valueWidth: 60),
              const _StatRowSkeleton(labelWidth: 120, valueWidth: 30),
              const _StatRowSkeleton(labelWidth: 130, valueWidth: 40),
              const _StatRowSkeleton(labelWidth: 100, valueWidth: 70),
            ] else ...[
              _StatRow(
                label: 'Practice streak',
                value: stats == null
                    ? '—'
                    : stats.streak == 1
                        ? '1 day'
                        : '${stats.streak} days',
              ),
              _StatRow(
                label: 'Total sessions',
                value: stats == null ? '—' : '${stats.totalSessions}',
              ),
              _StatRow(
                label: 'Minutes of practice',
                value: stats == null ? '—' : '${stats.minutes}',
              ),
              _StatRow(
                label: 'Favorite time',
                value: stats?.favoriteTime ?? '—',
              ),
            ],
            if (!_loading && _usage != null && _usage!.subscribed) ...[
              const SizedBox(height: 40),
              _SectionLabel(text: 'Plan'),
              const SizedBox(height: 16),
              _UsageCard(usage: _usage!),
            ],
            const SizedBox(height: 40),
            _SectionLabel(text: 'Settings'),
            const SizedBox(height: 4),
            _EditableRow(
              label: 'Name',
              value: me?.name ?? '—',
              onTap: me == null ? null : _editName,
            ),
            _EditableRow(
              label: 'Experience',
              value: _formatLevel(me?.experienceLevel),
              onTap: me == null ? null : _editExperience,
            ),
            _EditableRow(
              label: 'Intentions',
              value: _formatGoals(me),
              onTap: me == null ? null : _editGoals,
            ),
            _EditableRow(
              label: 'Voice',
              value: _formatVoice(me?.voiceGender),
              onTap: me == null ? null : _editVoice,
            ),
            _EditableRow(
              label: 'Reminder time',
              value: _formatHour(me?.notificationHour ?? 8),
              onTap: me == null ? null : _editNotificationHour,
            ),
            const SizedBox(height: 48),
            ClerkAuthBuilder(
              builder: (context, authState) => GestureDetector(
                onTap: () async {
                  await authState.signOut();
                  if (context.mounted) context.go('/');
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(100),
                    border: Border.all(color: AppColors.divider),
                  ),
                  child: Center(
                    child: Text(
                      'Sign out',
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            color: AppColors.textSecondary,
                            fontWeight: FontWeight.w500,
                          ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  String _formatLevel(String? v) {
    return switch (v) {
      'beginner' => 'New to it',
      'intermediate' => 'Some experience',
      'experienced' => 'Experienced',
      _ => '—',
    };
  }

  String _formatVoice(String? v) {
    return switch (v) {
      'female' => 'Female',
      'male' => 'Male',
      _ => '—',
    };
  }

  String _formatHour(int hour) {
    if (hour == 0) return '12am';
    if (hour < 12) return '${hour}am';
    if (hour == 12) return '12pm';
    return '${hour - 12}pm';
  }

  String _formatGoals(UserMe? me) {
    if (me == null || me.primaryGoals.isEmpty) return '—';
    final labels = me.primaryGoals.map((g) {
      if (g == 'other') {
        final c = me.primaryGoalCustom;
        return c == null || c.isEmpty ? 'Other' : '"$c"';
      }
      return switch (g) {
        'stress' => 'Stress',
        'sleep' => 'Sleep',
        'focus' => 'Focus',
        'anxiety' => 'Anxiety',
        'general' => 'Curiosity',
        _ => g,
      };
    }).toList();
    return labels.join(', ');
  }
}

class _UsageCard extends StatelessWidget {
  final UsageInfo usage;
  const _UsageCard({required this.usage});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final resetText = usage.periodEnd != null
        ? 'Resets ${DateFormat('MMMM d').format(usage.periodEnd!)}'
        : 'Active';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${usage.minutesUsed} / ${usage.minutesLimit} min',
                style: textTheme.headlineMedium?.copyWith(fontSize: 16),
              ),
              Row(
                children: [
                  if (usage.isTrial)
                    Container(
                      margin: const EdgeInsets.only(right: 8),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.accent.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'Trial',
                        style: textTheme.bodySmall?.copyWith(
                          color: AppColors.accent,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  Text(
                    resetText,
                    style: textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: usage.usageFraction,
              minHeight: 6,
              backgroundColor: AppColors.divider,
              valueColor: const AlwaysStoppedAnimation<Color>(AppColors.accent),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '${usage.minutesRemaining} min remaining this month',
            style: textTheme.bodyMedium?.copyWith(color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel({required this.text});

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            letterSpacing: 1.2,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
    );
  }
}

class _StatRowSkeleton extends StatelessWidget {
  final double labelWidth;
  final double valueWidth;
  const _StatRowSkeleton({
    required this.labelWidth,
    required this.valueWidth,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _SkeletonBar(width: labelWidth, height: 14),
          _SkeletonBar(width: valueWidth, height: 16),
        ],
      ),
    );
  }
}

class _SkeletonBar extends StatelessWidget {
  final double width;
  final double height;
  const _SkeletonBar({required this.width, required this.height});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppColors.divider.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(6),
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  final String label;
  final String value;
  const _StatRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: textTheme.bodyLarge),
          Text(
            value,
            style: textTheme.headlineMedium?.copyWith(fontSize: 18),
          ),
        ],
      ),
    );
  }
}

class _EditableRow extends StatelessWidget {
  final String label;
  final String value;
  final VoidCallback? onTap;

  const _EditableRow({
    required this.label,
    required this.value,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          children: [
            Text(label, style: textTheme.bodyLarge),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                value,
                textAlign: TextAlign.right,
                overflow: TextOverflow.ellipsis,
                style: textTheme.bodyLarge?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ),
            const SizedBox(width: 8),
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

// ─────── Bottom sheet modals ───────

class _SheetScaffold extends StatelessWidget {
  final String title;
  final Widget child;
  final VoidCallback? onSave;
  final bool saveEnabled;

  const _SheetScaffold({
    required this.title,
    required this.child,
    required this.onSave,
    this.saveEnabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
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
              Text(title, style: textTheme.headlineMedium),
              const SizedBox(height: 20),
              child,
              const SizedBox(height: 24),
              FilledButton(
                onPressed: saveEnabled ? onSave : null,
                child: const Text('Save'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(
            color: selected ? AppColors.accent : AppColors.divider,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? AppColors.accent : AppColors.textPrimary,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _NameSheet extends StatefulWidget {
  final String initial;
  const _NameSheet({required this.initial});

  @override
  State<_NameSheet> createState() => _NameSheetState();
}

class _NameSheetState extends State<_NameSheet> {
  late final TextEditingController _c;

  @override
  void initState() {
    super.initState();
    _c = TextEditingController(text: widget.initial);
    _c.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _SheetScaffold(
      title: 'What should we call you?',
      saveEnabled: _c.text.trim().isNotEmpty,
      onSave: () => Navigator.of(context).pop(_c.text.trim()),
      child: TextField(
        controller: _c,
        autofocus: true,
        style: Theme.of(context).textTheme.bodyLarge,
        decoration: const InputDecoration(hintText: 'Your name'),
      ),
    );
  }
}

class _ExperienceSheet extends StatefulWidget {
  final String? initial;
  const _ExperienceSheet({required this.initial});

  @override
  State<_ExperienceSheet> createState() => _ExperienceSheetState();
}

class _ExperienceSheetState extends State<_ExperienceSheet> {
  String? _selected;

  @override
  void initState() {
    super.initState();
    _selected = widget.initial;
  }

  @override
  Widget build(BuildContext context) {
    const options = [
      ('beginner', 'New to it'),
      ('intermediate', 'Some experience'),
      ('experienced', 'Experienced'),
    ];
    return _SheetScaffold(
      title: 'How familiar are you with meditation?',
      saveEnabled: _selected != null,
      onSave: () => Navigator.of(context).pop(_selected),
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: options
            .map((opt) => _Chip(
                  label: opt.$2,
                  selected: _selected == opt.$1,
                  onTap: () => setState(() => _selected = opt.$1),
                ))
            .toList(),
      ),
    );
  }
}

class _GoalsResult {
  final List<String> goals;
  final String? custom;
  _GoalsResult(this.goals, this.custom);
}

class _GoalsSheet extends StatefulWidget {
  final List<String> initialGoals;
  final String initialCustom;
  const _GoalsSheet({
    required this.initialGoals,
    required this.initialCustom,
  });

  @override
  State<_GoalsSheet> createState() => _GoalsSheetState();
}

class _GoalsSheetState extends State<_GoalsSheet> {
  final Set<String> _goals = {};
  late final TextEditingController _other;
  final _otherFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _goals.addAll(widget.initialGoals);
    _other = TextEditingController(text: widget.initialCustom);
    _other.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _other.dispose();
    _otherFocus.dispose();
    super.dispose();
  }

  bool get _valid {
    if (_goals.isEmpty) return false;
    if (_goals.contains('other') && _other.text.trim().isEmpty) return false;
    return true;
  }

  void _toggle(String v) {
    setState(() {
      if (_goals.contains(v)) {
        _goals.remove(v);
        if (v == 'other') {
          _other.clear();
          _otherFocus.unfocus();
        }
      } else {
        _goals.add(v);
        if (v == 'other') {
          WidgetsBinding.instance.addPostFrameCallback(
            (_) => _otherFocus.requestFocus(),
          );
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    const options = [
      ('stress', 'Stress'),
      ('sleep', 'Sleep'),
      ('focus', 'Focus'),
      ('anxiety', 'Anxiety'),
      ('general', 'Just curious'),
      ('other', 'Other'),
    ];
    return _SheetScaffold(
      title: 'What brings you here?',
      saveEnabled: _valid,
      onSave: () => Navigator.of(context).pop(
        _GoalsResult(
          _goals.toList(),
          _goals.contains('other') ? _other.text.trim() : null,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: options
                .map((opt) => _Chip(
                      label: opt.$2,
                      selected: _goals.contains(opt.$1),
                      onTap: () => _toggle(opt.$1),
                    ))
                .toList(),
          ),
          if (_goals.contains('other')) ...[
            const SizedBox(height: 16),
            TextField(
              controller: _other,
              focusNode: _otherFocus,
              style: Theme.of(context).textTheme.bodyLarge,
              decoration: const InputDecoration(
                hintText: 'In your own words...',
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _NotificationHourSheet extends StatefulWidget {
  final int initial;
  const _NotificationHourSheet({required this.initial});

  @override
  State<_NotificationHourSheet> createState() => _NotificationHourSheetState();
}

class _NotificationHourSheetState extends State<_NotificationHourSheet> {
  late int _selected;

  @override
  void initState() {
    super.initState();
    _selected = widget.initial;
  }

  @override
  Widget build(BuildContext context) {
    const options = [
      (6, 'Early — 6am'),
      (8, 'Morning — 8am'),
      (12, 'Lunch — 12pm'),
      (15, 'Afternoon — 3pm'),
      (18, 'Evening — 6pm'),
      (21, 'Night — 9pm'),
    ];
    return _SheetScaffold(
      title: 'Reminder time',
      onSave: () => Navigator.of(context).pop(_selected),
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: options
            .map((opt) => _Chip(
                  label: opt.$2,
                  selected: _selected == opt.$1,
                  onTap: () => setState(() => _selected = opt.$1),
                ))
            .toList(),
      ),
    );
  }
}

class _VoiceSheet extends StatefulWidget {
  final String initial;
  const _VoiceSheet({required this.initial});

  @override
  State<_VoiceSheet> createState() => _VoiceSheetState();
}

class _VoiceSheetState extends State<_VoiceSheet> {
  late String _selected;

  @override
  void initState() {
    super.initState();
    _selected = widget.initial;
  }

  @override
  Widget build(BuildContext context) {
    return _SheetScaffold(
      title: 'Voice',
      onSave: () => Navigator.of(context).pop(_selected),
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          _Chip(
            label: 'Female',
            selected: _selected == 'female',
            onTap: () => setState(() => _selected = 'female'),
          ),
          _Chip(
            label: 'Male',
            selected: _selected == 'male',
            onTap: () => setState(() => _selected = 'male'),
          ),
        ],
      ),
    );
  }
}
