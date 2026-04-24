import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter/services.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
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
      _package?.storeProduct.priceString ?? '\$19.99';

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
    // Backend is source of truth — make sure we've seen the webhook (or the
    // optimistic flag) before routing on, so the next screen doesn't bounce
    // the user back to the paywall.
    await SubscriptionService.instance.refreshFromBackend();
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
                'Personalized to what works for you over time',
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

              const SizedBox(height: 4),

              // Auto-renewal disclosure (Apple requirement) + legal links.
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Text(
                  'Your subscription renews automatically each month until '
                  'cancelled in Settings → Apple ID → Subscriptions. Payment '
                  'is charged to your Apple ID.',
                  textAlign: TextAlign.center,
                  style: textTheme.bodySmall?.copyWith(
                    color: AppColors.textSecondary,
                    fontSize: 11,
                    height: 1.4,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _LegalLink(
                    label: 'Terms',
                    url: 'https://craftedday.com/terms',
                  ),
                  Text('  •  ',
                      style: textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                      )),
                  _LegalLink(
                    label: 'Privacy',
                    url: 'https://craftedday.com/privacy',
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

class _LegalLink extends StatelessWidget {
  final String label;
  final String url;
  const _LegalLink({required this.label, required this.url});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => launchUrl(Uri.parse(url),
          mode: LaunchMode.externalApplication),
      child: Text(
        label,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: AppColors.textSecondary,
              fontSize: 11,
              decoration: TextDecoration.underline,
            ),
      ),
    );
  }
}
