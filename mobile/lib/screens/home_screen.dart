import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/colors.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _generate() {
    final prompt = _controller.text.trim();
    if (prompt.isEmpty) return;
    context.push('/player?prompt=${Uri.encodeComponent(prompt)}');
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
          onPressed: () => context.push('/history'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_outline, size: 22),
            color: AppColors.textSecondary,
            onPressed: () => context.push('/profile'),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(flex: 2),
              Text(
                greeting,
                style: textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'How are you\nfeeling today?',
                style: textTheme.displayLarge?.copyWith(
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 40),
              TextField(
                controller: _controller,
                maxLines: 5,
                minLines: 3,
                style: textTheme.bodyLarge,
                decoration: const InputDecoration(
                  hintText: 'Share what\'s on your mind...',
                ),
                textInputAction: TextInputAction.newline,
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: _generate,
                      child: const Text('Begin meditation'),
                    ),
                  ),
                ],
              ),
              const Spacer(flex: 3),
            ],
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
}
