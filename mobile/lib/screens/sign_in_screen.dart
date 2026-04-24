import 'dart:async';
import 'dart:convert';

import 'package:clerk_auth/clerk_auth.dart' as clerk;
import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:uuid/uuid.dart';
import '../theme/colors.dart';

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  StreamSubscription<clerk.ClerkError>? _errorSub;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _errorSub ??= ClerkAuth.errorStreamOf(context).listen((err) {
      // ignore: avoid_print
      print('CLERK_ERROR: code=${err.code} message=${err.message} '
          'argument=${err.argument} errors=${err.errors?.errorMessage}');
    });
  }

  @override
  void dispose() {
    _errorSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: ClerkAuthBuilder(
        builder: (context, authState) {
          // User just signed in (e.g. OAuth callback returned) → go to gate
          if (authState.user != null) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (context.mounted) context.go('/');
            });
          }

          final textTheme = Theme.of(context).textTheme;

          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Spacer(flex: 2),
                  Image.asset(
                    'assets/icon/icon_transparent.png',
                    width: 80,
                    height: 80,
                  ),
                  const SizedBox(height: 24),
                  Text('CraftedDay', style: textTheme.displayMedium),
                  const SizedBox(height: 8),
                  Text(
                    'Your daily meditation practice.',
                    style: textTheme.bodyLarge?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const Spacer(flex: 3),
                  _SocialButton(
                    label: 'Continue with Apple',
                    icon: Icons.apple,
                    onTap: () async {
                      try {
                        final credential =
                            await SignInWithApple.getAppleIDCredential(
                          nonce: const Uuid().v4(),
                          scopes: [
                            AppleIDAuthorizationScopes.email,
                            AppleIDAuthorizationScopes.fullName,
                          ],
                        );
                        final idToken = credential.identityToken;
                        if (idToken == null || !context.mounted) return;
                        final givenName = credential.givenName ?? 'Given';
                        final familyName = credential.familyName ?? 'Family';
                        final parts = idToken.split('.');
                        if (parts.length == 3) {
                          try {
                            final payload = utf8.decode(base64Url
                                .decode(base64Url.normalize(parts[1])));
                            // ignore: avoid_print
                            print('APPLE_ID_TOKEN_PAYLOAD: $payload');
                          } catch (e) {
                            // ignore: avoid_print
                            print('APPLE_ID_TOKEN_DECODE_ERROR: $e');
                          }
                        }
                        await authState.idTokenSignIn(
                          provider: clerk.IdTokenProvider.apple,
                          token: idToken,
                        );
                        // If Clerk wants missing fields filled in for sign-up,
                        // complete them now.
                        if (authState.signUp case final signUp?
                            when signUp.missingFields.isNotEmpty) {
                          final legalAccepted =
                              signUp.missing(clerk.Field.legalAccepted)
                                  ? true
                                  : null;
                          final firstName =
                              signUp.missing(clerk.Field.firstName)
                                  ? givenName
                                  : null;
                          final lastName = signUp.missing(clerk.Field.lastName)
                              ? familyName
                              : null;
                          await authState.attemptSignUp(
                            legalAccepted: legalAccepted,
                            firstName: firstName,
                            lastName: lastName,
                          );
                        }
                        if (context.mounted) context.go('/');
                      } catch (e, st) {
                        // ignore: avoid_print
                        print('APPLE_SIGNIN_ERROR: $e');
                        // ignore: avoid_print
                        print('APPLE_SIGNIN_STACK: $st');
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text("Apple sign-in failed: $e")),
                        );
                      }
                    },
                  ),
                  const SizedBox(height: 12),
                  _SocialButton(
                    label: 'Continue with Google',
                    icon: Icons.g_mobiledata_rounded,
                    onTap: () => authState.ssoSignIn(
                      context,
                      clerk.Strategy.oauthGoogle,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'By continuing you agree to our Terms of Service and Privacy Policy.',
                    textAlign: TextAlign.center,
                    style: textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _SocialButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  const _SocialButton({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(color: AppColors.divider),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 22, color: AppColors.textPrimary),
            const SizedBox(width: 10),
            Text(
              label,
              style: textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
  }
}
