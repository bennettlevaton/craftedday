import 'package:app_links/app_links.dart';
import 'package:audio_session/audio_session.dart';
import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:just_audio_background/just_audio_background.dart';
import 'package:url_launcher/url_launcher.dart';
import 'router.dart';
import 'services/clerk_service.dart';
import 'services/subscription_service.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: '.env');

  // Wires up MPNowPlayingInfoCenter / MPRemoteCommandCenter so iOS surfaces
  // lock-screen + Control Center playback controls. Must run before any
  // AudioPlayer is constructed.
  await JustAudioBackground.init(
    androidNotificationChannelId: 'com.craftedday.craftedday.audio',
    androidNotificationChannelName: 'Meditation playback',
    androidNotificationOngoing: true,
  );

  const rcKey = String.fromEnvironment('REVENUECAT_API_KEY');
  final revenueCatKey = rcKey.isNotEmpty
      ? rcKey
      : dotenv.env['REVENUECAT_API_KEY'] ?? '';
  if (revenueCatKey.isNotEmpty) {
    await SubscriptionService.instance.configure(revenueCatKey);
  }

  // Configure audio session for background playback (screen lock, etc.)
  final session = await AudioSession.instance;
  await session.configure(const AudioSessionConfiguration(
    avAudioSessionCategory: AVAudioSessionCategory.playback,
    avAudioSessionMode: AVAudioSessionMode.defaultMode,
    androidAudioAttributes: AndroidAudioAttributes(
      contentType: AndroidAudioContentType.speech,
      usage: AndroidAudioUsage.media,
    ),
    androidAudioFocusGainType: AndroidAudioFocusGainType.gain,
  ));

  runApp(const CraftedDayApp());
}

class CraftedDayApp extends StatefulWidget {
  const CraftedDayApp({super.key});

  @override
  State<CraftedDayApp> createState() => _CraftedDayAppState();
}

class _CraftedDayAppState extends State<CraftedDayApp>
    with WidgetsBindingObserver {
  final _appLinks = AppLinks();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // When the user comes back from backgrounding, re-pull subscription state
    // from the backend. Catches expirations, renewals webhook-lag, and
    // cross-device purchases without requiring a cold start.
    if (state == AppLifecycleState.resumed) {
      SubscriptionService.instance.refreshFromBackend();
    }
  }

  @override
  Widget build(BuildContext context) {
    const defined = String.fromEnvironment('CLERK_PUBLISHABLE_KEY');
    final publishableKey = defined.isNotEmpty
        ? defined
        : dotenv.env['CLERK_PUBLISHABLE_KEY'] ?? '';

    final config = ClerkAuthConfig(
      publishableKey: publishableKey,
      deepLinkStream: _appLinks.uriLinkStream,
      redirectionGenerator: (_, __) =>
          Uri.parse('craftedday://oauth-callback'),
      defaultLaunchMode: LaunchMode.externalApplication,
    );

    return MaterialApp.router(
      title: 'CraftedDay',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: appRouter,
      builder: (context, child) => ClerkAuth(
        config: config,
        child: ClerkErrorListener(
          handler: _silenceTransientNetworkErrors,
          child: child!,
        ),
      ),
    );
  }

  // iOS suspends sockets when the app backgrounds; the next Clerk token
  // refresh hits a dead fd and surfaces "Bad file descriptor" or similar
  // transient network errors. The SDK retries on the next call, so don't
  // toast the user about it.
  static void _silenceTransientNetworkErrors(
    BuildContext context,
    dynamic error,
  ) {
    final msg = error.toString().toLowerCase();
    if (msg.contains('bad file descriptor') ||
        msg.contains('connection closed') ||
        msg.contains('connection reset') ||
        msg.contains('software caused connection abort') ||
        msg.contains('socketexception')) {
      return; // swallow
    }
    // Any other Clerk error: log it but don't snackbar — we don't want
    // raw SDK strings on the user's screen anyway.
    debugPrint('Clerk error: $error');
  }
}
