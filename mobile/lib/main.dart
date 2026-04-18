import 'package:flutter/material.dart';
import 'router.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const CraftedDayApp());
}

class CraftedDayApp extends StatelessWidget {
  const CraftedDayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'CraftedDay',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: appRouter,
    );
  }
}
