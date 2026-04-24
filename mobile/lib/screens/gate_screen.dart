import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/api_service.dart';
import '../services/clerk_service.dart';
import '../services/subscription_service.dart';
import '../theme/colors.dart';

class GateScreen extends StatefulWidget {
  const GateScreen({super.key});

  @override
  State<GateScreen> createState() => _GateScreenState();
}

class _GateScreenState extends State<GateScreen> {
  bool _deciding = false;
  int _retries = 0;
  static const _maxRetries = 10;

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

    // Clerk still initializing — reset and retry up to limit.
    if (authState.isNotAvailable) {
      _retries++;
      if (_retries < _maxRetries) {
        _deciding = false;
      } else {
        // Took too long — send to sign-in
        if (mounted) context.go('/sign-in');
      }
      return;
    }
    _retries = 0;

    if (authState.user == null) {
      if (mounted) context.go('/sign-in');
      _deciding = false;
      return;
    }

    // login() identifies the user to RC and pulls sub state from our backend
    // (source of truth). Must await so isPremium is accurate before routing.
    await SubscriptionService.instance.login(authState.user!.id);

    // Non-subscribers go straight to the gated paywall.
    if (!SubscriptionService.instance.isPremium) {
      if (mounted) context.go('/paywall?gated=1');
      _deciding = false;
      return;
    }

    try {
      final me = await apiService.getMe();
      if (!mounted) return;
      context.go(me.needsOnboarding ? '/welcome' : '/home');
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
