import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../models/meditation.dart';
import '../services/api_service.dart';
import '../theme/colors.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  UserStats? _stats;
  String _voiceGender = 'female';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        apiService.getStats(),
        apiService.getVoiceGender(),
      ]);
      if (!mounted) return;
      setState(() {
        _stats = results[0] as UserStats;
        _voiceGender = results[1] as String;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _setVoice(String gender) async {
    if (_voiceGender == gender) return;
    final previous = _voiceGender;
    setState(() => _voiceGender = gender);
    try {
      await apiService.setVoiceGender(gender);
    } catch (_) {
      if (!mounted) return;
      setState(() => _voiceGender = previous);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Couldn\'t update voice. Try again.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final stats = _stats;

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
              Text('Profile', style: textTheme.displayMedium),
              const SizedBox(height: 40),
              if (_loading)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: CircularProgressIndicator(
                      color: AppColors.accent,
                      strokeWidth: 2,
                    ),
                  ),
                )
              else ...[
                _StatRow(
                  label: 'Current streak',
                  value: stats == null
                      ? '—'
                      : stats.streak == 1
                          ? '1 day'
                          : '${stats.streak} days',
                ),
                _StatRow(
                  label: 'Total sessions',
                  value: stats == null ? '—' : '${stats.totalSessions}',
                ),
                _StatRow(
                  label: 'Hours meditated',
                  value: stats == null ? '—' : '${stats.hours}',
                ),
                _StatRow(
                  label: 'Favorite time',
                  value: stats?.favoriteTime ?? '—',
                ),
              ],
              const SizedBox(height: 48),
              Text(
                'Voice',
                style: textTheme.headlineMedium?.copyWith(fontSize: 16),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  _VoiceToggle(
                    label: 'Female',
                    selected: _voiceGender == 'female',
                    onTap: () => _setVoice('female'),
                  ),
                  const SizedBox(width: 12),
                  _VoiceToggle(
                    label: 'Male',
                    selected: _voiceGender == 'male',
                    onTap: () => _setVoice('male'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  final String label;
  final String value;
  const _StatRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: textTheme.bodyLarge),
          Text(
            value,
            style: textTheme.headlineMedium?.copyWith(fontSize: 18),
          ),
        ],
      ),
    );
  }
}

class _VoiceToggle extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _VoiceToggle({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent : AppColors.surface,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(
            color: selected ? AppColors.accent : AppColors.divider,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? AppColors.surface : AppColors.textPrimary,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
