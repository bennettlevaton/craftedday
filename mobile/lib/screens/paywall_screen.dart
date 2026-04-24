import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter/services.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import '../services/api_service.dart';
import '../services/subscription_service.dart';
import '../theme/colors.dart';

class PaywallScreen extends StatefulWidget {
  final bool gated;
  const PaywallScreen({super.key, this.gated = false});

  @override
  State<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends State<PaywallScreen> {
  Package? _package;
  bool _loading = true;
  bool _purchasing = false;
  String? _error;

  bool get _hasTrial =>
      _package == null || _package!.storeProduct.introductoryPrice != null;

  String get _priceString =>
      _package?.storeProduct.priceString ?? '\$24.99';

  @override
  void initState() {
    super.initState();
    _loadOfferings();
  }

  Future<void> _loadOfferings() async {
    try {
      final offerings = await SubscriptionService.instance.getOfferings();
      if (!mounted) return;
      setState(() {
        _package = offerings?.current?.monthly ??
            offerings?.current?.availablePackages.firstOrNull;
        _loading = false;
      });
    } catch (e) {
      debugPrint('RC offerings error: $e');
      if (!mounted) return;
      setState(() { _loading = false; });
    }
  }

  Future<void> _purchase() async {
    final pkg = _package;
    if (_purchasing) return;
    if (pkg == null) {
      setState(() => _error = 'Subscriptions aren\'t available right now. Please try again soon.');
      return;
    }
    setState(() { _purchasing = true; _error = null; });
    try {
      final success = await SubscriptionService.instance.purchase(pkg);
      if (!mounted) return;
      if (success) await _onSuccess();
    } on PlatformException catch (e) {
      if (!mounted) return;
      final code = PurchasesErrorHelper.getErrorCode(e);
      if (code != PurchasesErrorCode.purchaseCancelledError) {
        setState(() => _error = 'Purchase failed. Please try again.');
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Purchase failed. Please try again.');
    } finally {
      if (mounted) setState(() => _purchasing = false);
    }
  }

  Future<void> _restore() async {
    setState(() { _purchasing = true; _error = null; });
    try {
      final success = await SubscriptionService.instance.restorePurchases();
      if (!mounted) return;
      if (success) {
        await _onSuccess();
      } else {
        setState(() => _error = 'No active subscription found.');
      }
    } on PlatformException catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Restore failed. Please try again.');
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Restore failed. Please try again.');
    } finally {
      if (mounted) setState(() => _purchasing = false);
    }
  }

  Future<void> _onSuccess() async {
    if (widget.gated) {
      try {
        final me = await apiService.getMe();
        if (!mounted) return;
        context.go(me.needsOnboarding ? '/welcome' : '/home');
      } catch (_) {
        if (mounted) context.go('/home');
      }
    } else {
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: widget.gated
          ? null
          : AppBar(
              leading: IconButton(
                icon: const Icon(Icons.close, size: 22),
                color: AppColors.textSecondary,
                onPressed: () => context.pop(),
              ),
            ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(28, 0, 28, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(height: widget.gated ? 40 : 8),

              // Logo + wordmark
              Row(
                children: [
                  Image.asset('assets/icon/icon_transparent.png',
                      width: 32, height: 32),
                  const SizedBox(width: 10),
                  Text('CraftedDay', style: textTheme.displayMedium),
                ],
              ),

              const SizedBox(height: 28),

              // Headline
              Text(
                _hasTrial
                    ? 'Experience 3 days\nof calm, free.'
                    : 'Your daily\nmeditation practice.',
                style: textTheme.displayMedium?.copyWith(height: 1.15),
              ),

              const SizedBox(height: 24),

              // Value props
              ...[
                'A fresh 10-min session crafted for you every morning',
                '150 min/month of custom sessions, any time',
                'AI that learns and adapts to what works for you',
                'Your full session history, forever',
              ].map((line) => Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Padding(
                          padding: EdgeInsets.only(top: 2),
                          child: Icon(Icons.check_rounded,
                              size: 20, color: AppColors.accent),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(line, style: textTheme.bodyLarge),
                        ),
                      ],
                    ),
                  )),

              const Spacer(),

              // Price line
              Text(
                _hasTrial
                    ? 'Then $_priceString / month — cancel any time'
                    : '$_priceString / month — cancel any time',
                textAlign: TextAlign.center,
                style: textTheme.bodyMedium
                    ?.copyWith(color: AppColors.textSecondary),
              ),

              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!,
                    textAlign: TextAlign.center,
                    style: textTheme.bodyMedium
                        ?.copyWith(color: Colors.red.shade400)),
              ],

              const SizedBox(height: 12),

              FilledButton(
                onPressed: (_purchasing || _loading) ? null : _purchase,
                child: _purchasing
                    ? const SizedBox(
                        height: 20, width: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2),
                      )
                    : Text(_hasTrial
                        ? 'Try Free for 3 Days'
                        : 'Start my practice'),
              ),

              const SizedBox(height: 8),

              TextButton(
                onPressed: (_purchasing || _loading) ? null : _restore,
                child: Text('Restore purchases',
                    style: textTheme.bodyMedium
                        ?.copyWith(color: AppColors.textSecondary)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
