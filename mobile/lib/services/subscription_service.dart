import 'package:purchases_flutter/purchases_flutter.dart';
import 'api_service.dart';

// Backend is source of truth — the `subscriptions` table (fed by RC webhook)
// decides whether the user has access. RC SDK is used only for (a) identifying
// the user to RC, (b) running purchase/restore flows, and (c) an optimistic
// flip right after a successful purchase while we wait for the webhook to land.
class SubscriptionService {
  static final SubscriptionService instance = SubscriptionService._();
  SubscriptionService._();

  bool _configured = false;
  bool _isPremium = false;
  bool get isPremium => _isPremium;

  final List<void Function(bool)> _listeners = [];

  Future<void> configure(String apiKey) async {
    await Purchases.configure(PurchasesConfiguration(apiKey));
    _configured = true;
  }

  Future<void> login(String userId) async {
    if (_configured) {
      try { await Purchases.logIn(userId); } catch (_) {}
    }
    await refreshFromBackend();
    // If backend hasn't seen a purchase for this user but StoreKit has a
    // valid receipt (e.g. reinstall, new device, same Apple ID), silently
    // restore. Fixes the "paid on another device, see paywall here" trap
    // without requiring the user to tap "Restore purchases."
    if (!_isPremium && _configured) {
      try {
        final info = await Purchases.restorePurchases();
        if (info.entitlements.active.containsKey('CraftedDay Pro')) {
          _setPremium(true);
          // Give the RC webhook a moment to write the subscriptions row,
          // then pull truth. Non-fatal if the webhook is slower than this.
          await Future.delayed(const Duration(seconds: 2));
          await refreshFromBackend();
        }
      } catch (_) {
        // Restore can throw on network issues — backend already has the
        // authoritative answer, so this is best-effort only.
      }
    }
  }

  Future<void> logout() async {
    if (_configured) {
      try { await Purchases.logOut(); } catch (_) {}
    }
    _setPremium(false);
  }

  // Pull subscription state from our backend. Call on app resume, after
  // returning from paywall, etc. On transient failure we keep the last-known
  // value rather than silently revoking access.
  Future<void> refreshFromBackend() async {
    final usage = await apiService.getUsage();
    if (usage == null) return;
    _setPremium(usage.subscribed);
  }

  Future<Offerings?> getOfferings() async {
    if (!_configured) return null;
    return await Purchases.getOfferings();
  }

  Future<bool> purchase(Package package) async {
    if (!_configured) return false;
    final result = await Purchases.purchase(PurchaseParams.package(package));
    final rcGranted =
        result.customerInfo.entitlements.active.containsKey('CraftedDay Pro');
    if (rcGranted) {
      // Optimistic: StoreKit confirmed payment. Webhook will write the
      // subscriptions row within seconds; until then trust the SDK so the
      // user isn't bounced back to the paywall.
      _setPremium(true);
    }
    final usage = await apiService.getUsage();
    if (usage != null && usage.subscribed) _setPremium(true);
    return _isPremium;
  }

  Future<bool> restorePurchases() async {
    if (!_configured) return false;
    final info = await Purchases.restorePurchases();
    if (info.entitlements.active.containsKey('CraftedDay Pro')) {
      _setPremium(true);
    }
    await refreshFromBackend();
    return _isPremium;
  }

  void addListener(void Function(bool) listener) => _listeners.add(listener);
  void removeListener(void Function(bool) listener) => _listeners.remove(listener);

  void _setPremium(bool value) {
    if (_isPremium == value) return;
    _isPremium = value;
    for (final l in _listeners) { l(_isPremium); }
  }
}
