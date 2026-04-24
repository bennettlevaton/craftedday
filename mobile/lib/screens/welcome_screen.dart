import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/colors.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomePage {
  final String title;
  final String body;
  const _WelcomePage({required this.title, required this.body});
}

const _pages = [
  _WelcomePage(
    title: 'Meditation made\nfor this moment.',
    body:
        'Every session is crafted around what\'s on your mind — not a pre-recorded playlist.',
  ),
  _WelcomePage(
    title: 'Tell us how\nyou feel.',
    body:
        'A few words is all it takes. We\'ll guide you through 5 or 10 minutes, shaped to you.',
  ),
  _WelcomePage(
    title: 'A little every\nday goes far.',
    body:
        'Return tomorrow, and the next day. We\'ll remember what helped and keep tuning.',
  ),
];

class _WelcomeScreenState extends State<WelcomeScreen> {
  final _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    if (_index < _pages.length - 1) {
      _controller.nextPage(
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOut,
      );
    } else {
      context.go('/onboarding');
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final isLast = _index == _pages.length - 1;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => context.go('/onboarding'),
                child: Text(
                  'Skip',
                  style: textTheme.bodyMedium?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                onPageChanged: (i) => setState(() => _index = i),
                itemCount: _pages.length,
                itemBuilder: (_, i) {
                  final p = _pages[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 28),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Spacer(flex: 2),
                        _GlyphCircle(index: i),
                        const SizedBox(height: 40),
                        Text(
                          p.title,
                          style: textTheme.displayLarge?.copyWith(height: 1.1),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          p.body,
                          style: textTheme.bodyLarge?.copyWith(
                            color: AppColors.textSecondary,
                            height: 1.5,
                          ),
                        ),
                        const Spacer(flex: 3),
                      ],
                    ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(_pages.length, (i) {
                      final active = i == _index;
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 220),
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: active ? 20 : 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: active
                              ? AppColors.accent
                              : AppColors.divider,
                          borderRadius: BorderRadius.circular(100),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _next,
                      child: Text(isLast ? 'Let\'s begin' : 'Continue'),
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GlyphCircle extends StatelessWidget {
  final int index;
  const _GlyphCircle({required this.index});

  @override
  Widget build(BuildContext context) {
    final icon = switch (index) {
      0 => Icons.spa_outlined,
      1 => Icons.self_improvement_outlined,
      _ => Icons.favorite_border_rounded,
    };
    return Container(
      width: 96,
      height: 96,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.accent.withValues(alpha: 0.10),
      ),
      child: Icon(icon, size: 44, color: AppColors.accent),
    );
  }
}
