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
  List<Meditation>? _history;
  List<Meditation>? _favorites;
  Set<String> _favoriteIds = {};
  Object? _loadError;
  UserStats? _stats;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _loadAll();
    _loadStats();
  }

  Future<void> _loadAll({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _history = null;
        _favorites = null;
        _loadError = null;
      });
    }
    try {
      final results = await Future.wait([
        apiService.getHistory(),
        apiService.getFavorites(),
      ]);
      if (!mounted) return;
      setState(() {
        _history = results[0];
        _favorites = results[1];
        _favoriteIds = results[1].map((m) => m.id).toSet();
        _loadError = null;
      });
    } catch (e) {
      if (!mounted) return;
      if (silent) return;
      setState(() => _loadError = e);
    }
  }

  Future<void> _refreshHistory() async {
    try {
      final list = await apiService.getHistory();
      if (!mounted) return;
      setState(() => _history = list);
    } catch (_) {
      // Pull-to-refresh failures swallow silently — list still shows what we have.
    }
  }

  Future<void> _refreshFavorites() async {
    try {
      final list = await apiService.getFavorites();
      if (!mounted) return;
      setState(() {
        _favorites = list;
        _favoriteIds = list.map((m) => m.id).toSet();
      });
    } catch (_) {}
  }

  Future<void> _loadStats() async {
    try {
      final stats = await apiService.getStats();
      if (mounted) setState(() => _stats = stats);
    } catch (_) {
      // Nudge just won't show.
    }
  }

  Future<void> _toggleFavorite(Meditation session) async {
    final wasFavorite = _favoriteIds.contains(session.id);
    final newValue = !wasFavorite;
    setState(() {
      if (newValue) {
        _favoriteIds.add(session.id);
        if (_favorites != null && !_favorites!.any((m) => m.id == session.id)) {
          _favorites = [session, ..._favorites!];
        }
      } else {
        _favoriteIds.remove(session.id);
        _favorites = _favorites?.where((m) => m.id != session.id).toList();
      }
    });
    try {
      final confirmed = await apiService.toggleFavorite(session.id);
      if (!mounted) return;
      if (confirmed != newValue) {
        setState(() {
          if (confirmed) {
            _favoriteIds.add(session.id);
          } else {
            _favoriteIds.remove(session.id);
            _favorites = _favorites?.where((m) => m.id != session.id).toList();
          }
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        if (wasFavorite) {
          _favoriteIds.add(session.id);
          if (_favorites != null && !_favorites!.any((m) => m.id == session.id)) {
            _favorites = [session, ..._favorites!];
          }
        } else {
          _favoriteIds.remove(session.id);
          _favorites = _favorites?.where((m) => m.id != session.id).toList();
        }
      });
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
            sessions: _history,
            error: _loadError,
            favoriteIds: _favoriteIds,
            emptyText: 'Your practice will appear here',
            nudge: _nudgeCopy(_stats),
            onRefresh: _refreshHistory,
            onToggleFavorite: _toggleFavorite,
            onPopFromDetail: () => _loadAll(silent: true),
          ),
          _SessionList(
            sessions: _favorites,
            error: _loadError,
            favoriteIds: _favoriteIds,
            emptyText: 'Favorite sessions to revisit them here',
            onRefresh: _refreshFavorites,
            onToggleFavorite: _toggleFavorite,
            onPopFromDetail: () => _loadAll(silent: true),
          ),
        ],
      ),
    );
  }
}

class _SessionList extends StatelessWidget {
  final List<Meditation>? sessions;
  final Object? error;
  final Set<String> favoriteIds;
  final String emptyText;
  final String? nudge;
  final Future<void> Function() onRefresh;
  final Future<void> Function(Meditation) onToggleFavorite;
  final VoidCallback onPopFromDetail;

  const _SessionList({
    required this.sessions,
    required this.error,
    required this.favoriteIds,
    required this.emptyText,
    required this.onRefresh,
    required this.onToggleFavorite,
    required this.onPopFromDetail,
    this.nudge,
  });

  @override
  Widget build(BuildContext context) {
    if (sessions == null) {
      if (error != null) {
        return _EmptyState(
          icon: Icons.error_outline,
          text: "We couldn't load your sessions. Try again in a moment.",
        );
      }
      return const Center(
        child: CircularProgressIndicator(
          color: AppColors.accent,
          strokeWidth: 2,
        ),
      );
    }
    if (sessions!.isEmpty) {
      return RefreshIndicator(
        color: AppColors.accent,
        onRefresh: onRefresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: MediaQuery.of(context).size.height * 0.6,
              child: _EmptyState(icon: Icons.air, text: emptyText),
            ),
          ],
        ),
      );
    }
    final showNudge = nudge != null;
    return RefreshIndicator(
      color: AppColors.accent,
      onRefresh: onRefresh,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(28, 20, 28, 20),
        itemCount: sessions!.length + (showNudge ? 1 : 0),
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (_, i) {
          if (showNudge && i == 0) return _NudgeCard(text: nudge!);
          final idx = showNudge ? i - 1 : i;
          final session = sessions![idx];
          return _SessionCard(
            key: ValueKey(session.id),
            session: session,
            isFavorite: favoriteIds.contains(session.id),
            onToggleFavorite: () => onToggleFavorite(session),
            onPopFromDetail: onPopFromDetail,
          );
        },
      ),
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
  final VoidCallback onPopFromDetail;

  const _SessionCard({
    super.key,
    required this.session,
    required this.isFavorite,
    required this.onToggleFavorite,
    required this.onPopFromDetail,
  });

  Future<void> _openDetail(BuildContext context) async {
    await context.push('/meditation?id=${session.id}');
    onPopFromDetail();
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
