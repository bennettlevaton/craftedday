import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/api_service.dart';
import '../services/clerk_service.dart';
import '../theme/colors.dart';

class GateScreen extends StatefulWidget {
  const GateScreen({super.key});

  @override
  State<GateScreen> createState() => _GateScreenState();
}

class _GateScreenState extends State<GateScreen> {
  bool _deciding = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    ClerkService.instance.setAuthState(ClerkAuth.of(context));
    if (!_deciding) {
      _deciding = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _decide());
    }
  }

  Future<void> _decide() async {
    if (!mounted) return;

    final authState = ClerkAuth.of(context, listen: false);

    if (authState.user == null) {
      if (mounted) context.go('/sign-in');
      _deciding = false;
      return;
    }

    try {
      final me = await apiService.getMe();
      if (!mounted) return;
      context.go(me.needsOnboarding ? '/onboarding' : '/home');
    } on DioException catch (e) {
      if (!mounted) return;
      // 401 = token invalid → back to sign-in
      if (e.response?.statusCode == 401) {
        context.go('/sign-in');
      } else {
        context.go('/home');
      }
    } catch (_) {
      if (!mounted) return;
      context.go('/home');
    } finally {
      _deciding = false;
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
