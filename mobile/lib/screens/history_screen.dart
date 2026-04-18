import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/colors.dart';

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    // Placeholder mock data
    final sessions = [
      _MockSession('Stressed about work', '10 min', 'Yesterday', 5),
      _MockSession('Can\'t sleep', '10 min', '2 days ago', 4),
      _MockSession('Morning calm', '10 min', '3 days ago', 5),
    ];

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, size: 22),
          color: AppColors.textSecondary,
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 8),
              Text('History', style: textTheme.displayMedium),
              const SizedBox(height: 32),
              Expanded(
                child: ListView.separated(
                  itemCount: sessions.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (_, i) => _SessionCard(session: sessions[i]),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MockSession {
  final String prompt;
  final String duration;
  final String timeAgo;
  final int rating;
  _MockSession(this.prompt, this.duration, this.timeAgo, this.rating);
}

class _SessionCard extends StatelessWidget {
  final _MockSession session;
  const _SessionCard({required this.session});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  session.prompt,
                  style: textTheme.headlineMedium?.copyWith(fontSize: 17),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Text(session.duration, style: textTheme.bodyMedium),
                    Text(' · ', style: textTheme.bodyMedium),
                    Text(session.timeAgo, style: textTheme.bodyMedium),
                    const SizedBox(width: 12),
                    ...List.generate(
                      session.rating,
                      (_) => const Icon(
                        Icons.star_rounded,
                        size: 14,
                        color: AppColors.accent,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Icon(
            Icons.play_arrow_rounded,
            color: AppColors.textSecondary,
            size: 28,
          ),
        ],
      ),
    );
  }
}
