import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/api_service.dart';
import '../theme/colors.dart';

class GateScreen extends StatefulWidget {
  const GateScreen({super.key});

  @override
  State<GateScreen> createState() => _GateScreenState();
}

class _GateScreenState extends State<GateScreen> {
  @override
  void initState() {
    super.initState();
    _decide();
  }

  Future<void> _decide() async {
    try {
      final me = await apiService.getMe();
      if (!mounted) return;
      context.go(me.needsOnboarding ? '/onboarding' : '/home');
    } catch (_) {
      if (!mounted) return;
      // Fall through to home on error; HomeScreen will surface failures from
      // the generate flow if the backend is truly down.
      context.go('/home');
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(
            color: AppColors.accent,
            strokeWidth: 2,
          ),
        ),
      ),
    );
  }
}
