import 'package:purchases_flutter/purchases_flutter.dart';

class SubscriptionService {
  static final SubscriptionService instance = SubscriptionService._();
  SubscriptionService._();

  bool _configured = false;
  bool _isPremium = false;
  bool get isPremium => _isPremium;

  final List<void Function(bool)> _listeners = [];

  Future<void> configure(String apiKey) async {
    await Purchases.configure(PurchasesConfiguration(apiKey));
    Purchases.addCustomerInfoUpdateListener(_onUpdate);
    _configured = true;
  }

  Future<void> login(String userId) async {
    if (!_configured) return;
    try {
      final LogInResult result = await Purchases.logIn(userId);
      _updateStatus(result.customerInfo);
    } catch (_) {}
  }

  Future<void> logout() async {
    if (!_configured) return;
    try {
      await Purchases.logOut();
    } catch (_) {}
    _isPremium = false;
    _notify();
  }

  Future<void> refresh() async {
    if (!_configured) return;
    try {
      final info = await Purchases.getCustomerInfo();
      _updateStatus(info);
    } catch (_) {}
  }

  Future<Offerings?> getOfferings() async {
    if (!_configured) return null;
    return await Purchases.getOfferings();
  }

  Future<bool> purchase(Package package) async {
    if (!_configured) return false;
    final result = await Purchases.purchase(PurchaseParams.package(package));
    _updateStatus(result.customerInfo);
    return _isPremium;
  }

  Future<bool> restorePurchases() async {
    if (!_configured) return false;
    final info = await Purchases.restorePurchases();
    _updateStatus(info);
    return _isPremium;
  }

  void addListener(void Function(bool) listener) => _listeners.add(listener);
  void removeListener(void Function(bool) listener) => _listeners.remove(listener);

  void _onUpdate(CustomerInfo info) => _updateStatus(info);

  void _updateStatus(CustomerInfo info) {
    _isPremium = info.entitlements.active.containsKey('CraftedDay Pro');
    _notify();
  }

  void _notify() {
    for (final l in _listeners) { l(_isPremium); }
  }
}
