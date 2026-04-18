import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../models/meditation.dart';
import '../services/api_service.dart';
import '../theme/colors.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  late Future<List<Meditation>> _future;

  @override
  void initState() {
    super.initState();
    _future = apiService.getHistory();
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

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
                child: FutureBuilder<List<Meditation>>(
                  future: _future,
                  builder: (_, snap) {
                    if (snap.connectionState == ConnectionState.waiting) {
                      return const Center(
                        child: CircularProgressIndicator(
                          color: AppColors.accent,
                          strokeWidth: 2,
                        ),
                      );
                    }
                    if (snap.hasError) {
                      return _EmptyState(
                        icon: Icons.error_outline,
                        text: 'Couldn\'t load history.',
                      );
                    }
                    final sessions = snap.data ?? [];
                    if (sessions.isEmpty) {
                      return _EmptyState(
                        icon: Icons.air,
                        text: 'Your sessions will appear here',
                      );
                    }
                    return ListView.separated(
                      itemCount: sessions.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 12),
                      itemBuilder: (_, i) => _SessionCard(session: sessions[i]),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String text;
  const _EmptyState({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 40,
            color: AppColors.textSecondary.withValues(alpha: 0.5),
          ),
          const SizedBox(height: 16),
          Text(
            text,
            style: textTheme.bodyLarge?.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _SessionCard extends StatelessWidget {
  final Meditation session;
  const _SessionCard({required this.session});

  void _openDetail(BuildContext context) {
    context.push('/meditation?id=${session.id}');
  }

  void _play(BuildContext context) {
    context.push(
      '/player?audioUrl=${Uri.encodeComponent(session.audioUrl)}'
      '&id=${session.id}'
      '&duration=${session.duration ?? 30}'
      '&replay=1',
    );
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final unrated = session.rating == null;
    return GestureDetector(
      onTap: () => _openDetail(context),
      child: Container(
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
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.headlineMedium?.copyWith(fontSize: 17),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Text(_formatDuration(session.duration),
                          style: textTheme.bodyMedium),
                      Text(' · ', style: textTheme.bodyMedium),
                      Text(_formatTimeAgo(session.createdAt),
                          style: textTheme.bodyMedium),
                      const SizedBox(width: 12),
                      if (unrated)
                        Text(
                          'Rate',
                          style: textTheme.bodyMedium?.copyWith(
                            color: AppColors.accent,
                            fontWeight: FontWeight.w500,
                          ),
                        )
                      else
                        ...List.generate(
                          session.rating!,
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
            IconButton(
              icon: const Icon(Icons.play_arrow_rounded, size: 28),
              color: AppColors.textSecondary,
              onPressed: () => _play(context),
            ),
          ],
        ),
      ),
    );
  }
}

String _formatDuration(int? seconds) {
  if (seconds == null) return '—';
  if (seconds < 60) return '$seconds s';
  return '${(seconds / 60).round()} min';
}

String _formatTimeAgo(DateTime dt) {
  final now = DateTime.now();
  final diff = now.difference(dt);
  if (diff.inMinutes < 1) return 'Just now';
  if (diff.inHours < 1) return '${diff.inMinutes}m ago';
  if (diff.inDays < 1) return '${diff.inHours}h ago';
  if (diff.inDays < 2) return 'Yesterday';
  if (diff.inDays < 7) return '${diff.inDays} days ago';
  return '${(diff.inDays / 7).floor()}w ago';
}
