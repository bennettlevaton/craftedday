import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'clerk_service.dart';

class SupportService {
  static const email = 'support@craftedday.com';

  // Opens the user's mail client with prefilled subject/body. The trailing
  // context block (user id, platform) is what makes tickets actually actionable.
  // Falls back to copying the email address if no mail client is configured
  // (simulator, device without Mail set up) so it's never a dead end.
  static Future<void> open({
    required BuildContext context,
    required String subject,
    String? meditationId,
    String? note,
  }) async {
    final clerkUserId = ClerkService.instance.authState?.user?.id ?? 'unknown';
    final os = '${Platform.operatingSystem} ${Platform.operatingSystemVersion}';

    final bodyLines = <String>[
      if (note != null) note,
      '',
      '',
      '---',
      'User: $clerkUserId',
      if (meditationId != null) 'Session: $meditationId',
      'Platform: $os',
    ];

    final uri = Uri(
      scheme: 'mailto',
      path: email,
      queryParameters: {
        'subject': subject,
        'body': bodyLines.join('\n'),
      },
    );

    bool launched = false;
    try {
      launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      launched = false;
    }

    if (!launched && context.mounted) {
      await Clipboard.setData(const ClipboardData(text: email));
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Email copied — reach us at support@craftedday.com'),
          duration: Duration(seconds: 4),
        ),
      );
    }
  }
}
