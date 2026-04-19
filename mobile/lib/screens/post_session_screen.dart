import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/api_service.dart';
import '../theme/colors.dart';

class PostSessionScreen extends StatefulWidget {
  final String meditationId;

  const PostSessionScreen({super.key, required this.meditationId});

  @override
  State<PostSessionScreen> createState() => _PostSessionScreenState();
}

class _PostSessionScreenState extends State<PostSessionScreen> {
  final _feedbackController = TextEditingController();
  int _rating = 0;
  bool _submitting = false;

  @override
  void dispose() {
    _feedbackController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_rating == 0 || _submitting) return;
    setState(() => _submitting = true);
    try {
      await apiService.rateMeditation(
        id: widget.meditationId,
        rating: _rating,
        feedback: _feedbackController.text.trim().isEmpty
            ? null
            : _feedbackController.text.trim(),
      );
      if (!mounted) return;
      context.go('/home');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Couldn\'t save your feedback. ${e.toString()}')),
      );
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

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
                'How did that feel?',
                style: textTheme.bodyLarge?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 48),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: List.generate(5, (i) {
                  final filled = i < _rating;
                  return IconButton(
                    iconSize: 36,
                    onPressed: _submitting
                        ? null
                        : () => setState(() => _rating = i + 1),
                    icon: Icon(
                      filled ? Icons.star_rounded : Icons.star_outline_rounded,
                      color: filled ? AppColors.accent : AppColors.textSecondary,
                    ),
                  );
                }),
              ),
              const SizedBox(height: 32),
              TextField(
                controller: _feedbackController,
                maxLines: 4,
                minLines: 3,
                enabled: !_submitting,
                style: textTheme.bodyLarge,
                decoration: const InputDecoration(
                  hintText: 'Anything you\'d want different? (optional)',
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _rating > 0 && !_submitting ? _submit : null,
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
              const SizedBox(height: 12),
              TextButton(
                onPressed: _submitting ? null : () => context.go('/home'),
                child: Text(
                  'Skip',
                  style: textTheme.bodyMedium?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }
}
