import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../models/meditation.dart';
import '../services/api_service.dart';
import '../theme/colors.dart';

class MeditationDetailScreen extends StatefulWidget {
  final String id;

  const MeditationDetailScreen({super.key, required this.id});

  @override
  State<MeditationDetailScreen> createState() => _MeditationDetailScreenState();
}

class _MeditationDetailScreenState extends State<MeditationDetailScreen> {
  final _feedbackController = TextEditingController();
  Meditation? _meditation;
  int _rating = 0;
  bool _loading = true;
  bool _saving = false;
  bool _dirty = false;

  @override
  void initState() {
    super.initState();
    _load();
    _feedbackController.addListener(() {
      if (!_dirty) setState(() => _dirty = true);
    });
  }

  @override
  void dispose() {
    _feedbackController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final m = await apiService.getMeditation(widget.id);
      if (!mounted) return;
      setState(() {
        _meditation = m;
        _rating = m.rating ?? 0;
        _feedbackController.text = m.feedback ?? '';
        _loading = false;
        _dirty = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Couldn\'t load session. ${e.toString()}')),
      );
    }
  }

  Future<void> _save() async {
    if (_rating == 0 || _saving) return;
    setState(() => _saving = true);
    try {
      await apiService.rateMeditation(
        id: widget.id,
        rating: _rating,
        feedback: _feedbackController.text.trim().isEmpty
            ? null
            : _feedbackController.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _saving = false;
        _dirty = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saved')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Couldn\'t save. ${e.toString()}')),
      );
    }
  }

  void _play() {
    final m = _meditation;
    if (m == null) return;
    context.push(
      '/player?audioUrl=${Uri.encodeComponent(m.audioUrl)}'
      '&id=${m.id}'
      '&duration=${m.duration ?? 30}'
      '&replay=1',
    );
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final m = _meditation;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, size: 22),
          color: AppColors.textSecondary,
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(
                  color: AppColors.accent,
                  strokeWidth: 2,
                ),
              )
            : m == null
                ? Center(
                    child: Text(
                      'Session not found',
                      style: textTheme.bodyLarge?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                  )
                : Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 28),
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 8),
                          Text(
                            _formatDate(m.createdAt),
                            style: textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 6),
                          Text(m.prompt, style: textTheme.displayMedium),
                          const SizedBox(height: 24),
                          GestureDetector(
                            onTap: _play,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 24,
                                vertical: 16,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.surface,
                                borderRadius: BorderRadius.circular(100),
                                border: Border.all(color: AppColors.divider),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(
                                    Icons.play_arrow_rounded,
                                    color: AppColors.accent,
                                    size: 24,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    'Play again',
                                    style: textTheme.bodyLarge?.copyWith(
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 40),
                          Text(
                            'Your rating',
                            style: textTheme.headlineMedium
                                ?.copyWith(fontSize: 16),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: List.generate(5, (i) {
                              final filled = i < _rating;
                              return IconButton(
                                padding: EdgeInsets.zero,
                                iconSize: 34,
                                onPressed: _saving
                                    ? null
                                    : () => setState(() {
                                          _rating = i + 1;
                                          _dirty = true;
                                        }),
                                icon: Icon(
                                  filled
                                      ? Icons.star_rounded
                                      : Icons.star_outline_rounded,
                                  color: filled
                                      ? AppColors.accent
                                      : AppColors.textSecondary,
                                ),
                              );
                            }),
                          ),
                          const SizedBox(height: 24),
                          Text(
                            'Feedback',
                            style: textTheme.headlineMedium
                                ?.copyWith(fontSize: 16),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _feedbackController,
                            maxLines: 4,
                            minLines: 3,
                            enabled: !_saving,
                            style: textTheme.bodyLarge,
                            decoration: const InputDecoration(
                              hintText:
                                  'What would you want different next time?',
                            ),
                          ),
                          const SizedBox(height: 24),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton(
                              onPressed: (_rating > 0 && _dirty && !_saving)
                                  ? _save
                                  : null,
                              child: _saving
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: AppColors.surface,
                                      ),
                                    )
                                  : const Text('Save'),
                            ),
                          ),
                          const SizedBox(height: 24),
                        ],
                      ),
                    ),
                  ),
      ),
    );
  }

  String _formatDate(DateTime dt) {
    final months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
  }
}
