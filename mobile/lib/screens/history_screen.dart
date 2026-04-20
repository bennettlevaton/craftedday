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

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _historyFuture = apiService.getHistory();
    _favoritesFuture = apiService.getFavorites();
    // Refresh favorites list when switching to that tab
    _tabs.addListener(() {
      if (_tabs.index == 1 && !_tabs.indexIsChanging) {
        setState(() { _favoritesFuture = apiService.getFavorites(); });
      }
    });
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
  final VoidCallback onRefresh;

  const _SessionList({
    required this.future,
    required this.emptyText,
    required this.onRefresh,
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
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(28, 20, 28, 20),
          itemCount: sessions.length,
          separatorBuilder: (_, _) => const SizedBox(height: 12),
          itemBuilder: (_, i) => _SessionCard(
            session: sessions[i],
            onRefresh: onRefresh,
          ),
        );
      },
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
                    s.prompt,
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
