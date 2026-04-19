import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/api_service.dart';
import '../theme/colors.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _controller = TextEditingController();
  bool _loading = false;
  String? _name;

  @override
  void initState() {
    super.initState();
    _loadName();
  }

  Future<void> _loadName() async {
    try {
      final me = await apiService.getMe();
      if (!mounted) return;
      setState(() => _name = me.name);
    } catch (_) {
      // No greeting by name; not critical.
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _generate() async {
    final prompt = _controller.text.trim();
    if (prompt.isEmpty || _loading) return;

    setState(() => _loading = true);
    try {
      final result = await apiService.generateMeditation(prompt: prompt);
      if (!mounted) return;
      context.push(
        '/player?audioUrl=${Uri.encodeComponent(result.audioUrl)}'
        '&id=${result.id}'
        '&duration=${result.duration}',
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Something went wrong. ${e.toString()}')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final greeting = _greeting();
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.history, size: 22),
          color: AppColors.textSecondary,
          onPressed: _loading ? null : () => context.push('/history'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_outline, size: 22),
            color: AppColors.textSecondary,
            onPressed: _loading ? null : () => context.push('/profile'),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Stack(
        children: [
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Spacer(flex: 2),
                  Text(
                    _name == null ? greeting : '$greeting, $_name',
                    style: textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'How are you\nfeeling today?',
                    style: textTheme.displayLarge?.copyWith(height: 1.1),
                  ),
                  const SizedBox(height: 40),
                  TextField(
                    controller: _controller,
                    autofocus: true,
                    maxLines: 5,
                    minLines: 3,
                    enabled: !_loading,
                    style: textTheme.bodyLarge,
                    decoration: const InputDecoration(
                      hintText: 'Share what\'s on your mind...',
                    ),
                    textInputAction: TextInputAction.newline,
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _loading ? null : _generate,
                      child: const Text('Begin meditation'),
                    ),
                  ),
                  const Spacer(flex: 3),
                ],
              ),
            ),
          ),
          if (_loading) const _LoadingOverlay(),
        ],
      ),
    );
  }

  String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }
}

class _LoadingOverlay extends StatelessWidget {
  const _LoadingOverlay();

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Container(
      color: AppColors.background.withValues(alpha: 0.96),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 32,
              height: 32,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppColors.accent,
              ),
            ),
            const SizedBox(height: 28),
            Text(
              'Crafting your session',
              style: textTheme.headlineMedium?.copyWith(fontSize: 18),
            ),
            const SizedBox(height: 6),
            Text(
              'This will take a moment.',
              style: textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}
