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
  String? _whatHelped;
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
        whatHelped: _whatHelped,
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
        const SnackBar(content: Text('Saved')),
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
                ? Center(child: Text('Session not found', style: textTheme.bodyLarge?.copyWith(color: AppColors.textSecondary)))
                : SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 28),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 8),
                        Text(_formatDate(m.createdAt), style: textTheme.bodyMedium),
                        const SizedBox(height: 6),
                        Text(m.prompt, style: textTheme.displayMedium),
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
                          if (m.whatHelped != null)
                            _InfoRow(label: 'What helped', value: _capitalize(m.whatHelped!)),
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
                            Text('What helped?', style: textTheme.headlineMedium?.copyWith(fontSize: 16)),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 10,
                              runSpacing: 10,
                              children: [
                                _Chip(label: 'Breath', selected: _whatHelped == 'breath', onTap: () => setState(() => _whatHelped = _whatHelped == 'breath' ? null : 'breath')),
                                _Chip(label: 'Body', selected: _whatHelped == 'body', onTap: () => setState(() => _whatHelped = _whatHelped == 'body' ? null : 'body')),
                                _Chip(label: 'Silence', selected: _whatHelped == 'silence', onTap: () => setState(() => _whatHelped = _whatHelped == 'silence' ? null : 'silence')),
                                _Chip(label: 'Visualization', selected: _whatHelped == 'visualization', onTap: () => setState(() => _whatHelped = _whatHelped == 'visualization' ? null : 'visualization')),
                              ],
                            ),
                            const SizedBox(height: 20),
                            TextField(
                              controller: _notesController,
                              maxLines: 3,
                              minLines: 2,
                              style: textTheme.bodyLarge,
                              decoration: const InputDecoration(hintText: 'Anything to note? (optional)'),
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

  String _capitalize(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
}

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
