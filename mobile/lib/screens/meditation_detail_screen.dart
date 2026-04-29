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
  final _notesController = TextEditingController();
  Meditation? _meditation;
  bool _loading = true;
  String? _feeling;
  final Set<String> _whatHelped = <String>{};
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final m = await apiService.getMeditation(widget.id);
      if (!mounted) return;
      setState(() {
        _meditation = m;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  void _play() {
    final m = _meditation;
    if (m == null) return;
    context.push(
      '/player?audioUrl=${Uri.encodeComponent(m.audioUrl)}'
      '&id=${m.id}'
      '&duration=${m.duration ?? 30}'
      '${m.title != null ? '&title=${Uri.encodeComponent(m.title!)}' : ''}'
      '&replay=1',
    );
  }

  Future<void> _submitCheckin() async {
    if (_feeling == null || _submitting) return;
    setState(() => _submitting = true);
    try {
      await apiService.submitCheckin(
        id: widget.id,
        feeling: _feeling!,
        whatHelped: _whatHelped.toList(growable: false),
        feedback: _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
      );
      if (!mounted) return;
      final updated = await apiService.getMeditation(widget.id);
      setState(() {
        _meditation = updated;
        _submitting = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Check-in saved')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
    }
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
            ? const Center(child: CircularProgressIndicator(color: AppColors.accent, strokeWidth: 2))
            : m == null
                ? Center(child: Text('Session unavailable', style: textTheme.bodyLarge?.copyWith(color: AppColors.textSecondary)))
                : SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 28),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 8),
                        Text(_formatDate(m.createdAt), style: textTheme.bodyMedium),
                        const SizedBox(height: 6),
                        Text(m.title ?? m.prompt, style: textTheme.displayMedium),
                        if (m.title != null) ...[
                          const SizedBox(height: 4),
                          Text(m.prompt, style: textTheme.bodyMedium?.copyWith(color: AppColors.textSecondary)),
                        ],
                        const SizedBox(height: 24),
                        GestureDetector(
                          onTap: _play,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                            decoration: BoxDecoration(
                              color: AppColors.surface,
                              borderRadius: BorderRadius.circular(100),
                              border: Border.all(color: AppColors.divider),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.play_arrow_rounded, color: AppColors.accent, size: 24),
                                const SizedBox(width: 8),
                                Text('Play again', style: textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w500)),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 32),

                        // Already checked in — show read-only
                        if (m.feeling != null) ...[
                          _InfoRow(label: 'Feeling', value: _formatFeeling(m.feeling!)),
                          if (m.whatHelped.isNotEmpty)
                            _InfoRow(label: 'What helped', value: m.whatHelped.map(_formatHelped).join(', ')),
                          if (m.feedback != null && m.feedback!.isNotEmpty)
                            _InfoRow(label: 'Note', value: m.feedback!),
                        ],

                        // No check-in yet — show the form
                        if (m.feeling == null) ...[
                          Text('How did you feel?', style: textTheme.headlineMedium?.copyWith(fontSize: 16)),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 10,
                            children: [
                              _Chip(label: 'Calmer', selected: _feeling == 'calmer', onTap: () => setState(() => _feeling = 'calmer')),
                              _Chip(label: 'Same', selected: _feeling == 'same', onTap: () => setState(() => _feeling = 'same')),
                              _Chip(label: 'More tense', selected: _feeling == 'tense', onTap: () => setState(() => _feeling = 'tense')),
                            ],
                          ),
                          if (_feeling != null) ...[
                            const SizedBox(height: 20),
                            Text('What helped? (pick any)', style: textTheme.headlineMedium?.copyWith(fontSize: 16)),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 10,
                              runSpacing: 10,
                              children: _detailHelpedOptions
                                  .map((o) => _Chip(
                                        label: o.$1,
                                        selected: _whatHelped.contains(o.$2),
                                        onTap: () => setState(() {
                                          if (_whatHelped.contains(o.$2)) {
                                            _whatHelped.remove(o.$2);
                                          } else {
                                            _whatHelped.add(o.$2);
                                          }
                                        }),
                                      ))
                                  .toList(growable: false),
                            ),
                            const SizedBox(height: 20),
                            TextField(
                              controller: _notesController,
                              maxLines: 3,
                              minLines: 2,
                              maxLength: 200,
                              style: textTheme.bodyLarge,
                              textCapitalization: TextCapitalization.sentences,
                              decoration: const InputDecoration(
                                hintText: 'Anything to note? (optional)',
                                counterText: '',
                              ),
                            ),
                            const SizedBox(height: 20),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton(
                                onPressed: _feeling != null && !_submitting ? _submitCheckin : null,
                                child: _submitting
                                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.surface))
                                    : const Text('Save'),
                              ),
                            ),
                          ],
                        ],
                        const SizedBox(height: 32),
                      ],
                    ),
                  ),
      ),
    );
  }

  String _formatDate(DateTime dt) {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
  }

  String _formatFeeling(String feeling) => switch (feeling) {
    'calmer' => 'Calmer',
    'same' => 'Same',
    'tense' => 'More tense',
    _ => feeling,
  };

  String _formatHelped(String tag) => switch (tag) {
    'breath' => 'Breath',
    'body' => 'Body',
    'belly_anchor' => 'Belly anchor',
    'release' => 'Release',
    'silence' => 'Silence',
    'visualization' => 'Visualization',
    'voice' => 'Voice',
    'pacing' => 'Pacing',
    _ => tag,
  };
}

const _detailHelpedOptions = <(String, String)>[
  ('Breath', 'breath'),
  ('Body', 'body'),
  ('Belly anchor', 'belly_anchor'),
  ('Release', 'release'),
  ('Silence', 'silence'),
  ('Visualization', 'visualization'),
  ('Voice', 'voice'),
  ('Pacing', 'pacing'),
];

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 100, child: Text(label, style: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500))),
          Expanded(child: Text(value, style: textTheme.bodyLarge)),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _Chip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(color: selected ? AppColors.accent : AppColors.divider, width: selected ? 1.5 : 1),
        ),
        child: Text(label, style: TextStyle(color: selected ? AppColors.accent : AppColors.textPrimary, fontWeight: FontWeight.w500)),
      ),
    );
  }
}
