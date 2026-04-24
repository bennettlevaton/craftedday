import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/api_service.dart';
import '../theme/colors.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _nameController = TextEditingController();
  final _otherController = TextEditingController();
  final _otherFocus = FocusNode();

  String? _level;
  final Set<String> _goals = {};
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _nameController.addListener(_onAnyChange);
    _otherController.addListener(_onAnyChange);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _otherController.dispose();
    _otherFocus.dispose();
    super.dispose();
  }

  void _onAnyChange() => setState(() {});

  bool get _isValid {
    if (_nameController.text.trim().isEmpty) return false;
    if (_level == null) return false;
    if (_goals.isEmpty) return false;
    if (_goals.contains('other') && _otherController.text.trim().isEmpty) {
      return false;
    }
    return true;
  }

  Future<void> _submit() async {
    if (!_isValid || _submitting) return;
    setState(() => _submitting = true);
    try {
      await apiService.submitOnboarding(
        name: _nameController.text.trim(),
        experienceLevel: _level!,
        primaryGoals: _goals.toList(),
        primaryGoalCustom: _goals.contains('other')
            ? _otherController.text.trim()
            : null,
      );
      if (!mounted) return;
      context.go('/home');
    } catch (_) {
      if (!mounted) return;
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("We couldn't save that. Please try again.")),
      );
    }
  }

  void _toggleGoal(String value) {
    setState(() {
      if (_goals.contains(value)) {
        _goals.remove(value);
        if (value == 'other') {
          _otherController.clear();
          _otherFocus.unfocus();
        }
      } else {
        _goals.add(value);
        if (value == 'other') {
          WidgetsBinding.instance.addPostFrameCallback(
            (_) => _otherFocus.requestFocus(),
          );
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 32),
              Text(
                'Welcome.',
                style: textTheme.displayLarge?.copyWith(height: 1.1),
              ),
              const SizedBox(height: 8),
              Text(
                'A few things so we can meditate with you, not at you.',
                style: textTheme.bodyLarge?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 40),
              _Label(text: 'What should we call you?'),
              const SizedBox(height: 12),
              TextField(
                controller: _nameController,
                autofocus: true,
                style: textTheme.bodyLarge,
                decoration: const InputDecoration(hintText: 'Your name'),
                textInputAction: TextInputAction.done,
                textCapitalization: TextCapitalization.words,
                onSubmitted: (_) => FocusScope.of(context).unfocus(),
              ),
              const SizedBox(height: 32),
              _Label(text: 'How familiar are you with meditation?'),
              const SizedBox(height: 12),
              _SingleChoice(
                options: const [
                  ('beginner', 'New to it'),
                  ('intermediate', 'Some experience'),
                  ('experienced', 'Experienced'),
                ],
                selected: _level,
                onSelect: (v) => setState(() => _level = v),
              ),
              const SizedBox(height: 32),
              _Label(text: 'What brings you here?'),
              const SizedBox(height: 4),
              Text(
                'Pick any that apply.',
                style: textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 12),
              _MultiChoice(
                options: const [
                  ('stress', 'Stress'),
                  ('sleep', 'Sleep'),
                  ('focus', 'Focus'),
                  ('anxiety', 'Anxiety'),
                  ('general', 'Just curious'),
                  ('other', 'Other'),
                ],
                selected: _goals,
                onToggle: _toggleGoal,
              ),
              if (_goals.contains('other')) ...[
                const SizedBox(height: 16),
                TextField(
                  controller: _otherController,
                  focusNode: _otherFocus,
                  style: textTheme.bodyLarge,
                  decoration: const InputDecoration(
                    hintText: 'In your own words...',
                  ),
                ),
              ],
              const SizedBox(height: 48),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _isValid && !_submitting ? _submit : null,
                  child: _submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.surface,
                          ),
                        )
                      : const Text('Begin'),
                ),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String text;
  const _Label({required this.text});

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontSize: 16),
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

class _SingleChoice extends StatelessWidget {
  final List<(String, String)> options;
  final String? selected;
  final ValueChanged<String> onSelect;

  const _SingleChoice({
    required this.options,
    required this.selected,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: options
          .map((opt) => _Chip(
                label: opt.$2,
                selected: selected == opt.$1,
                onTap: () => onSelect(opt.$1),
              ))
          .toList(),
    );
  }
}

class _MultiChoice extends StatelessWidget {
  final List<(String, String)> options;
  final Set<String> selected;
  final ValueChanged<String> onToggle;

  const _MultiChoice({
    required this.options,
    required this.selected,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: options
          .map((opt) => _Chip(
                label: opt.$2,
                selected: selected.contains(opt.$1),
                onTap: () => onToggle(opt.$1),
              ))
          .toList(),
    );
  }
}
