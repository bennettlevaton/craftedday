import 'package:go_router/go_router.dart';
import 'screens/home_screen.dart';
import 'screens/player_screen.dart';
import 'screens/post_session_screen.dart';
import 'screens/history_screen.dart';
import 'screens/profile_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
    GoRoute(
      path: '/player',
      builder: (_, state) {
        final prompt = state.uri.queryParameters['prompt'] ?? '';
        return PlayerScreen(prompt: prompt);
      },
    ),
    GoRoute(
      path: '/post-session',
      builder: (_, state) {
        final id = state.uri.queryParameters['id'] ?? '';
        return PostSessionScreen(meditationId: id);
      },
    ),
    GoRoute(path: '/history', builder: (_, __) => const HistoryScreen()),
    GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
  ],
);
