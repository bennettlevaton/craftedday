import 'package:app_links/app_links.dart';
import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:url_launcher/url_launcher.dart';
import 'router.dart';
import 'services/clerk_service.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: '.env');
  runApp(const CraftedDayApp());
}

class CraftedDayApp extends StatefulWidget {
  const CraftedDayApp({super.key});

  @override
  State<CraftedDayApp> createState() => _CraftedDayAppState();
}

class _CraftedDayAppState extends State<CraftedDayApp> {
  final _appLinks = AppLinks();

  @override
  Widget build(BuildContext context) {
    final publishableKey = dotenv.env['CLERK_PUBLISHABLE_KEY'] ?? '';

    return MaterialApp.router(
      title: 'CraftedDay',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: appRouter,
      builder: ClerkAuth.materialAppBuilder(
        config: ClerkAuthConfig(
          publishableKey: publishableKey,
          deepLinkStream: _appLinks.uriLinkStream,
          redirectionGenerator: (_, __) =>
              Uri.parse('craftedday://oauth-callback'),
          defaultLaunchMode: LaunchMode.externalApplication,
        ),
      ),
    );
  }
}
