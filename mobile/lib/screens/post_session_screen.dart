import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../models/meditation.dart';
import '../services/api_service.dart';
import '../theme/colors.dart';

class _HelpedOption {
  final String label;
  final String value;
  const _HelpedOption(this.label, this.value);
}

const _helpedOptions = <_HelpedOption>[
  _HelpedOption('Breath', 'breath'),
  _HelpedOption('Body', 'body'),
  _HelpedOption('Belly anchor', 'belly_anchor'),
  _HelpedOption('Release', 'release'),
  _HelpedOption('Silence', 'silence'),
  _HelpedOption('Visualization', 'visualization'),
  _HelpedOption('Voice', 'voice'),
  _HelpedOption('Pacing', 'pacing'),
];

class PostSessionScreen extends StatefulWidget {
  final String meditationId;
  const PostSessionScreen({super.key, required this.meditationId});

  @override
  State<PostSessionScreen> createState() => _PostSessionScreenState();
}

class _PostSessionScreenState extends State<PostSessionScreen> {
  final _notesController = TextEditingController();
  String? _feeling;
  final Set<String> _whatHelped = <String>{};
  bool _submitting = false;
  bool _submitted = false;
  UserStats? _statsAfter;
  String? _celebration;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_feeling == null || _submitting) return;
    setState(() => _submitting = true);
    try {
      final result = await apiService.submitCheckin(
        id: widget.meditationId,
        feeling: _feeling!,
        whatHelped: _whatHelped.toList(growable: false),
        feedback: _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
      );
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      setState(() {
        _submitting = false;
        _submitted = true;
        _statsAfter = result.stats;
        _celebration = result.celebration;
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
      return _CelebrationView(
        stats: _statsAfter,
        celebration: _celebration,
      );
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
                  'What helped? (pick any)',
                  style: textTheme.headlineMedium?.copyWith(fontSize: 16),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: _helpedOptions
                      .map((o) => _HelpedChip(
                            label: o.label,
                            value: o.value,
                            selected: _whatHelped.contains(o.value),
                            onTap: () => setState(() {
                              if (_whatHelped.contains(o.value)) {
                                _whatHelped.remove(o.value);
                              } else {
                                _whatHelped.add(o.value);
                              }
                            }),
                          ))
                      .toList(growable: false),
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _notesController,
                  maxLines: 1,
                  maxLength: 200,
                  style: textTheme.bodyLarge,
                  textInputAction: TextInputAction.done,
                  textCapitalization: TextCapitalization.sentences,
                  onSubmitted: (_) => FocusScope.of(context).unfocus(),
                  decoration: const InputDecoration(
                    hintText: 'Anything to note? (optional)',
                    counterText: '',
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
  final String? celebration;
  const _CelebrationView({required this.stats, required this.celebration});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final streak = stats?.streak ?? 0;
    final streakLine = streak >= 1 ? 'Day $streak of practice' : null;
    final closingLine = celebration?.trim().isNotEmpty == true
        ? celebration!
        : 'See you tomorrow.';

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
                closingLine,
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
