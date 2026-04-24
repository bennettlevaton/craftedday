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

class _HistoryScreenState extends State<HistoryScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  late Future<List<Meditation>> _historyFuture;
  late Future<List<Meditation>> _favoritesFuture;
  UserStats? _stats;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _historyFuture = apiService.getHistory();
    _favoritesFuture = apiService.getFavorites();
    _loadStats();
    // Refresh favorites list when switching to that tab
    _tabs.addListener(() {
      if (_tabs.index == 1 && !_tabs.indexIsChanging) {
        setState(() { _favoritesFuture = apiService.getFavorites(); });
      }
    });
  }

  Future<void> _loadStats() async {
    try {
      final stats = await apiService.getStats();
      if (mounted) setState(() => _stats = stats);
    } catch (_) {
      // Nudge just won't show.
    }
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
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
        bottom: TabBar(
          controller: _tabs,
          labelColor: AppColors.textPrimary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.accent,
          indicatorSize: TabBarIndicatorSize.label,
          labelStyle: textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w500),
          tabs: const [
            Tab(text: 'History'),
            Tab(text: 'Favorites'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _SessionList(
            future: _historyFuture,
            emptyText: 'Your sessions will appear here',
            nudge: _nudgeCopy(_stats),
            onRefresh: () { setState(() { _historyFuture = apiService.getHistory(); }); },
          ),
          _SessionList(
            future: _favoritesFuture,
            emptyText: 'Favorite sessions to revisit them here',
            onRefresh: () { setState(() { _favoritesFuture = apiService.getFavorites(); }); },
          ),
        ],
      ),
    );
  }
}

class _SessionList extends StatelessWidget {
  final Future<List<Meditation>> future;
  final String emptyText;
  final String? nudge;
  final VoidCallback onRefresh;

  const _SessionList({
    required this.future,
    required this.emptyText,
    required this.onRefresh,
    this.nudge,
  });

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Meditation>>(
      future: future,
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
          return _EmptyState(icon: Icons.error_outline, text: 'Couldn\'t load sessions.');
        }
        final sessions = snap.data ?? [];
        if (sessions.isEmpty) {
          return _EmptyState(icon: Icons.air, text: emptyText);
        }
        final showNudge = nudge != null;
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(28, 20, 28, 20),
          itemCount: sessions.length + (showNudge ? 1 : 0),
          separatorBuilder: (_, _) => const SizedBox(height: 12),
          itemBuilder: (_, i) {
            if (showNudge && i == 0) return _NudgeCard(text: nudge!);
            final idx = showNudge ? i - 1 : i;
            return _SessionCard(
              session: sessions[idx],
              onRefresh: onRefresh,
            );
          },
        );
      },
    );
  }
}

class _NudgeCard extends StatelessWidget {
  final String text;
  const _NudgeCard({required this.text});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.accent.withValues(alpha: 0.20)),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.local_fire_department_rounded,
            size: 18,
            color: AppColors.accent,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: textTheme.bodyMedium?.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String? _nudgeCopy(UserStats? stats) {
  if (stats == null) return null;
  if (stats.totalSessions == 0) return 'Your first session starts your streak.';
  if (stats.streak == 0) {
    return 'Return today to start a new streak.';
  }
  if (stats.streak == 1) {
    return 'One more session tomorrow for a 2-day streak.';
  }
  if (stats.streak < 7) {
    final remaining = 7 - stats.streak;
    return remaining == 1
        ? 'One more day for a full week.'
        : '$remaining more days for a full week.';
  }
  return null;
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
          Icon(icon, size: 40, color: AppColors.textSecondary.withValues(alpha: 0.5)),
          const SizedBox(height: 16),
          Text(
            text,
            style: textTheme.bodyLarge?.copyWith(color: AppColors.textSecondary),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _SessionCard extends StatefulWidget {
  final Meditation session;
  final VoidCallback onRefresh;

  const _SessionCard({required this.session, required this.onRefresh});

  @override
  State<_SessionCard> createState() => _SessionCardState();
}

class _SessionCardState extends State<_SessionCard> {
  late bool _isFavorite;

  @override
  void initState() {
    super.initState();
    _isFavorite = widget.session.isFavorite;
  }

  Future<void> _toggleFavorite() async {
    final newValue = !_isFavorite;
    setState(() => _isFavorite = newValue);
    try {
      final confirmed = await apiService.toggleFavorite(widget.session.id);
      if (mounted) setState(() => _isFavorite = confirmed);
    } catch (_) {
      if (mounted) setState(() => _isFavorite = !newValue);
    }
  }

  Future<void> _openDetail() async {
    await context.push('/meditation?id=${widget.session.id}');
    widget.onRefresh();
  }

  void _play() {
    context.push(
      '/player?audioUrl=${Uri.encodeComponent(widget.session.audioUrl)}'
      '&id=${widget.session.id}'
      '&duration=${widget.session.duration ?? 30}'
      '&replay=1',
    );
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final s = widget.session;

    return GestureDetector(
      onTap: _openDetail,
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 16, 12, 16),
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
                    s.title ?? s.prompt,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.headlineMedium?.copyWith(fontSize: 17),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Text(_formatDuration(s.duration), style: textTheme.bodyMedium),
                      Text(' · ', style: textTheme.bodyMedium),
                      Text(_formatTimeAgo(s.createdAt), style: textTheme.bodyMedium),
                      if (s.feeling != null) ...[
                        const SizedBox(width: 10),
                        Text(
                          _feelingLabel(s.feeling!),
                          style: textTheme.bodyMedium?.copyWith(
                            color: AppColors.accent,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            IconButton(
              icon: Icon(
                _isFavorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                size: 22,
                color: _isFavorite ? AppColors.accent : AppColors.textSecondary,
              ),
              onPressed: _toggleFavorite,
            ),
            IconButton(
              icon: const Icon(Icons.play_arrow_rounded, size: 26),
              color: AppColors.textSecondary,
              onPressed: _play,
            ),
          ],
        ),
      ),
    );
  }
}

String _feelingLabel(String feeling) => switch (feeling) {
  'calmer' => 'Calmer',
  'same' => 'Same',
  'tense' => 'More tense',
  _ => feeling,
};

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
