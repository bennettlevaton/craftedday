import 'package:go_router/go_router.dart';
import 'screens/gate_screen.dart';
import 'screens/home_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/welcome_screen.dart';
import 'screens/sign_in_screen.dart';
import 'screens/player_screen.dart';
import 'screens/post_session_screen.dart';
import 'screens/history_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/meditation_detail_screen.dart';
import 'screens/paywall_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (_, _) => const GateScreen()),
    GoRoute(path: '/sign-in', builder: (_, _) => const SignInScreen()),
    GoRoute(path: '/home', builder: (_, _) => const HomeScreen()),
    GoRoute(path: '/welcome', builder: (_, _) => const WelcomeScreen()),
    GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingScreen()),
    GoRoute(
      path: '/player',
      builder: (_, state) {
        final audioUrl = state.uri.queryParameters['audioUrl'] ?? '';
        final id = state.uri.queryParameters['id'] ?? '';
        final duration =
            int.tryParse(state.uri.queryParameters['duration'] ?? '30') ?? 30;
        final replay = state.uri.queryParameters['replay'] == '1';
        return PlayerScreen(
          audioUrl: audioUrl,
          id: id,
          duration: duration,
          replay: replay,
        );
      },
    ),
    GoRoute(
      path: '/post-session',
      builder: (_, state) {
        final id = state.uri.queryParameters['id'] ?? '';
        return PostSessionScreen(meditationId: id);
      },
    ),
    GoRoute(
      path: '/meditation',
      builder: (_, state) {
        final id = state.uri.queryParameters['id'] ?? '';
        return MeditationDetailScreen(id: id);
      },
    ),
    GoRoute(path: '/history', builder: (_, _) => const HistoryScreen()),
    GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen()),
    GoRoute(
      path: '/paywall',
      builder: (_, state) => PaywallScreen(
        gated: state.uri.queryParameters['gated'] == '1',
      ),
    ),
  ],
);
