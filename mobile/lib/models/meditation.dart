class Meditation {
  final String id;
  final String prompt;
  final String audioUrl;
  final int? duration;
  final DateTime createdAt;

  const Meditation({
    required this.id,
    required this.prompt,
    required this.audioUrl,
    this.duration,
    required this.createdAt,
  });

  factory Meditation.fromJson(Map<String, dynamic> json) {
    return Meditation(
      id: json['id'] as String,
      prompt: json['prompt'] as String,
      audioUrl: json['audioUrl'] as String,
      duration: json['duration'] as int?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
