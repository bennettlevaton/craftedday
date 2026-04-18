import 'package:go_router/go_router.dart';
import 'screens/home_screen.dart';
import 'screens/player_screen.dart';
import 'screens/post_session_screen.dart';
import 'screens/history_screen.dart';
import 'screens/profile_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (_, _) => const HomeScreen()),
    GoRoute(
      path: '/player',
      builder: (_, state) {
        final audioUrl = state.uri.queryParameters['audioUrl'] ?? '';
        final id = state.uri.queryParameters['id'] ?? '';
        final duration =
            int.tryParse(state.uri.queryParameters['duration'] ?? '30') ?? 30;
        return PlayerScreen(
          audioUrl: audioUrl,
          id: id,
          duration: duration,
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
    GoRoute(path: '/history', builder: (_, _) => const HistoryScreen()),
    GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen()),
  ],
);
