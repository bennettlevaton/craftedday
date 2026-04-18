import 'package:flutter/material.dart';

class PlayerScreen extends StatelessWidget {
  final String audioUrl;
  final String prompt;

  const PlayerScreen({
    super.key,
    required this.audioUrl,
    required this.prompt,
  });

  @override
  Widget build(BuildContext context) {
    // TODO: implement audio player UI
    return const Scaffold(
      body: Center(
        child: Text('Player'),
      ),
    );
  }
}
