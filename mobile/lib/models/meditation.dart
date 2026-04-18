class Meditation {
  final String id;
  final String prompt;
  final String audioUrl;
  final int? duration;
  final int? rating;
  final String? feedback;
  final DateTime createdAt;

  const Meditation({
    required this.id,
    required this.prompt,
    required this.audioUrl,
    this.duration,
    this.rating,
    this.feedback,
    required this.createdAt,
  });

  factory Meditation.fromJson(Map<String, dynamic> json) {
    return Meditation(
      id: json['id'] as String,
      prompt: json['prompt'] as String,
      audioUrl: json['audioUrl'] as String,
      duration: json['duration'] as int?,
      rating: json['rating'] as int?,
      feedback: json['feedback'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class UserStats {
  final int streak;
  final int totalSessions;
  final double hours;
  final String favoriteTime;

  const UserStats({
    required this.streak,
    required this.totalSessions,
    required this.hours,
    required this.favoriteTime,
  });

  factory UserStats.fromJson(Map<String, dynamic> json) {
    return UserStats(
      streak: json['streak'] as int,
      totalSessions: json['totalSessions'] as int,
      hours: (json['hours'] as num).toDouble(),
      favoriteTime: json['favoriteTime'] as String,
    );
  }
}
