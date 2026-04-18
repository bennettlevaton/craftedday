import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
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

  @override
  void dispose() {
    _feedbackController.dispose();
    super.dispose();
  }

  void _submit() {
    // TODO: submit rating + feedback
    context.go('/');
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
                    onPressed: () => setState(() => _rating = i + 1),
                    icon: Icon(
                      filled ? Icons.star_rounded : Icons.star_outline_rounded,
                      color:
                          filled ? AppColors.accent : AppColors.textSecondary,
                    ),
                  );
                }),
              ),
              const SizedBox(height: 32),
              TextField(
                controller: _feedbackController,
                maxLines: 4,
                minLines: 3,
                style: textTheme.bodyLarge,
                decoration: const InputDecoration(
                  hintText: 'Anything you\'d want different? (optional)',
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _rating > 0 ? _submit : null,
                  child: const Text('Done'),
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
