import 'package:clerk_flutter/clerk_flutter.dart';

// Holds the current auth state reference so ApiService can get tokens
// without needing a BuildContext.
class ClerkService {
  static final ClerkService instance = ClerkService._();
  ClerkService._();

  ClerkAuthState? _authState;
  ClerkAuthState? get authState => _authState;

  void setAuthState(ClerkAuthState state) => _authState = state;

  Future<String?> getToken() async {
    if (_authState?.user == null) return null;
    try {
      final token = await _authState!.sessionToken();
      return token?.jwt;
    } catch (_) {
      return null;
    }
  }

  bool get isSignedIn => _authState?.user != null;
}
