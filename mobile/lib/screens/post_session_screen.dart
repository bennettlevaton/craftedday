import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../models/meditation.dart';
import '../services/api_service.dart';
import '../theme/colors.dart';

class PostSessionScreen extends StatefulWidget {
  final String meditationId;
  const PostSessionScreen({super.key, required this.meditationId});

  @override
  State<PostSessionScreen> createState() => _PostSessionScreenState();
}

class _PostSessionScreenState extends State<PostSessionScreen> {
  final _notesController = TextEditingController();
  String? _feeling;
  String? _whatHelped;
  bool _submitting = false;
  bool _submitted = false;
  UserStats? _statsAfter;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_feeling == null || _submitting) return;
    setState(() => _submitting = true);
    try {
      await apiService.submitCheckin(
        id: widget.meditationId,
        feeling: _feeling!,
        whatHelped: _whatHelped,
        feedback: _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
      );
      UserStats? stats;
      try {
        stats = await apiService.getStats();
      } catch (_) {
        // Celebration still works without stats.
      }
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      setState(() {
        _submitting = false;
        _submitted = true;
        _statsAfter = stats;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Couldn\'t save. ${e.toString()}')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    if (_submitted) {
      return _CelebrationView(stats: _statsAfter);
    }

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 40),
              Text('Well done.', style: textTheme.displayMedium),
              const SizedBox(height: 8),
              Text(
                'How do you feel?',
                style: textTheme.bodyLarge?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 32),
              Row(
                children: [
                  _FeelingChip(
                    label: 'Calmer',
                    value: 'calmer',
                    selected: _feeling == 'calmer',
                    onTap: () => setState(() => _feeling = 'calmer'),
                  ),
                  const SizedBox(width: 10),
                  _FeelingChip(
                    label: 'Same',
                    value: 'same',
                    selected: _feeling == 'same',
                    onTap: () => setState(() => _feeling = 'same'),
                  ),
                  const SizedBox(width: 10),
                  _FeelingChip(
                    label: 'More tense',
                    value: 'tense',
                    selected: _feeling == 'tense',
                    onTap: () => setState(() => _feeling = 'tense'),
                  ),
                ],
              ),
              if (_feeling != null) ...[
                const SizedBox(height: 32),
                Text(
                  'What helped most?',
                  style: textTheme.headlineMedium?.copyWith(fontSize: 16),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _HelpedChip(label: 'Breath', value: 'breath', selected: _whatHelped == 'breath', onTap: () => setState(() => _whatHelped = _whatHelped == 'breath' ? null : 'breath')),
                    _HelpedChip(label: 'Body', value: 'body', selected: _whatHelped == 'body', onTap: () => setState(() => _whatHelped = _whatHelped == 'body' ? null : 'body')),
                    _HelpedChip(label: 'Silence', value: 'silence', selected: _whatHelped == 'silence', onTap: () => setState(() => _whatHelped = _whatHelped == 'silence' ? null : 'silence')),
                    _HelpedChip(label: 'Visualization', value: 'visualization', selected: _whatHelped == 'visualization', onTap: () => setState(() => _whatHelped = _whatHelped == 'visualization' ? null : 'visualization')),
                  ],
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _notesController,
                  maxLines: 3,
                  minLines: 2,
                  style: textTheme.bodyLarge,
                  decoration: const InputDecoration(
                    hintText: 'Anything to note? (optional)',
                  ),
                ),
              ],
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _feeling != null && !_submitting ? _submit : null,
                  child: _submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.surface,
                          ),
                        )
                      : const Text('Done'),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}

class _CelebrationView extends StatelessWidget {
  final UserStats? stats;
  const _CelebrationView({required this.stats});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final streak = stats?.streak ?? 0;
    final streakLine = streak >= 1
        ? (streak == 1 ? '1 day streak' : '$streak day streak')
        : null;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(flex: 2),
              Text('Well done.', style: textTheme.displayLarge),
              const SizedBox(height: 16),
              if (streakLine != null) ...[
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: Text(
                    streakLine,
                    style: textTheme.bodyMedium?.copyWith(
                      color: AppColors.accent,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(height: 20),
              ],
              Text(
                'See you tomorrow.',
                style: textTheme.bodyLarge?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const Spacer(flex: 3),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => context.go('/home'),
                  child: const Text('Continue'),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}

class _FeelingChip extends StatelessWidget {
  final String label;
  final String value;
  final bool selected;
  final VoidCallback onTap;

  const _FeelingChip({
    required this.label,
    required this.value,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
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

class _HelpedChip extends StatelessWidget {
  final String label;
  final String value;
  final bool selected;
  final VoidCallback onTap;

  const _HelpedChip({
    required this.label,
    required this.value,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
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
            fontSize: 14,
          ),
        ),
      ),
    );
  }
}
