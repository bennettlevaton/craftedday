import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/colors.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

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
              Text('Profile', style: textTheme.displayMedium),
              const SizedBox(height: 40),
              const _StatRow(label: 'Current streak', value: '7 days'),
              const _StatRow(label: 'Total sessions', value: '24'),
              const _StatRow(label: 'Hours meditated', value: '4.2'),
              const _StatRow(label: 'Favorite time', value: 'Morning'),
              const SizedBox(height: 48),
              Text(
                'Voice',
                style: textTheme.headlineMedium?.copyWith(fontSize: 16),
              ),
              const SizedBox(height: 16),
              Row(
                children: const [
                  _VoiceToggle(label: 'Female', selected: true),
                  SizedBox(width: 12),
                  _VoiceToggle(label: 'Male', selected: false),
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
  const _VoiceToggle({required this.label, required this.selected});

  @override
  Widget build(BuildContext context) {
    return Container(
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
    );
  }
}
