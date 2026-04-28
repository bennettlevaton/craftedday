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
  bool _loading = true;
  bool _loadFailed = false;
  List<Meditation> _history = [];
  List<Meditation> _favorites = [];
  final Set<String> _favoriteIds = {};
  UserStats? _stats;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _loadAll();
    _loadStats();
  }

  Future<void> _loadAll() async {
    try {
      final results = await Future.wait([
        apiService.getHistory(),
        apiService.getFavorites(),
      ]);
      if (!mounted) return;
      setState(() {
        _history = results[0];
        _favorites = results[1];
        _favoriteIds
          ..clear()
          ..addAll(_favorites.map((m) => m.id))
          ..addAll(_history.where((m) => m.isFavorite).map((m) => m.id));
        _loading = false;
        _loadFailed = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadFailed = true;
      });
    }
  }

  // Background refresh after returning from detail — keep current data on
  // screen so the lists don't flash a spinner.
  Future<void> _silentRefresh() async {
    try {
      final results = await Future.wait([
        apiService.getHistory(),
        apiService.getFavorites(),
      ]);
      if (!mounted) return;
      setState(() {
        _history = results[0];
        _favorites = results[1];
        _favoriteIds
          ..clear()
          ..addAll(_favorites.map((m) => m.id))
          ..addAll(_history.where((m) => m.isFavorite).map((m) => m.id));
      });
    } catch (_) {
      // Last-known data stays on screen.
    }
  }

  Future<void> _loadStats() async {
    try {
      final stats = await apiService.getStats();
      if (mounted) setState(() => _stats = stats);
    } catch (_) {
      // Nudge just won't show.
    }
  }

  Future<void> _toggleFavorite(Meditation m) async {
    final wasFav = _favoriteIds.contains(m.id);
    setState(() => _applyFavorite(m, !wasFav));
    try {
      final confirmed = await apiService.toggleFavorite(m.id);
      if (!mounted) return;
      if (confirmed != !wasFav) {
        setState(() => _applyFavorite(m, confirmed));
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _applyFavorite(m, wasFav));
    }
  }

  void _applyFavorite(Meditation m, bool isFav) {
    if (isFav) {
      _favoriteIds.add(m.id);
      if (!_favorites.any((x) => x.id == m.id)) {
        final list = [..._favorites, m]
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
        _favorites = list;
      }
    } else {
      _favoriteIds.remove(m.id);
      _favorites = _favorites.where((x) => x.id != m.id).toList();
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
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(
          color: AppColors.accent,
          strokeWidth: 2,
        ),
      );
    }
    if (_loadFailed) {
      return const _EmptyState(
        icon: Icons.error_outline,
        text: "We couldn't load your sessions. Try again in a moment.",
      );
    }
    return TabBarView(
      controller: _tabs,
      children: [
        _SessionList(
          sessions: _history,
          emptyText: 'Your practice will appear here',
          nudge: _nudgeCopy(_stats),
          favoriteIds: _favoriteIds,
          onToggleFavorite: _toggleFavorite,
          onDetailReturned: _silentRefresh,
        ),
        _SessionList(
          sessions: _favorites,
          emptyText: 'Favorite sessions to revisit them here',
          favoriteIds: _favoriteIds,
          onToggleFavorite: _toggleFavorite,
          onDetailReturned: _silentRefresh,
        ),
      ],
    );
  }
}

class _SessionList extends StatelessWidget {
  final List<Meditation> sessions;
  final String emptyText;
  final String? nudge;
  final Set<String> favoriteIds;
  final Future<void> Function(Meditation) onToggleFavorite;
  final Future<void> Function() onDetailReturned;

  const _SessionList({
    required this.sessions,
    required this.emptyText,
    required this.favoriteIds,
    required this.onToggleFavorite,
    required this.onDetailReturned,
    this.nudge,
  });

  @override
  Widget build(BuildContext context) {
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
        final m = sessions[idx];
        return _SessionCard(
          key: ValueKey(m.id),
          session: m,
          isFavorite: favoriteIds.contains(m.id),
          onToggleFavorite: () => onToggleFavorite(m),
          onDetailReturned: onDetailReturned,
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

class _SessionCard extends StatelessWidget {
  final Meditation session;
  final bool isFavorite;
  final VoidCallback onToggleFavorite;
  final Future<void> Function() onDetailReturned;

  const _SessionCard({
    super.key,
    required this.session,
    required this.isFavorite,
    required this.onToggleFavorite,
    required this.onDetailReturned,
  });

  Future<void> _openDetail(BuildContext context) async {
    await context.push('/meditation?id=${session.id}');
    await onDetailReturned();
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
    final s = session;

    return GestureDetector(
      onTap: () => _openDetail(context),
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
                isFavorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                size: 22,
                color: isFavorite ? AppColors.accent : AppColors.textSecondary,
              ),
              onPressed: onToggleFavorite,
            ),
            IconButton(
              icon: const Icon(Icons.play_arrow_rounded, size: 26),
              color: AppColors.textSecondary,
              onPressed: () => _play(context),
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
