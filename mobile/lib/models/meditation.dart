class Meditation {
  final String id;
  final String? title;
  final String prompt;
  final String audioUrl;
  final int? duration;
  final String? feeling;      // calmer | same | tense
  final String? whatHelped;   // breath | body | silence | visualization
  final String? feedback;
  final bool isFavorite;
  final DateTime createdAt;

  const Meditation({
    required this.id,
    this.title,
    required this.prompt,
    required this.audioUrl,
    this.duration,
    this.feeling,
    this.whatHelped,
    this.feedback,
    this.isFavorite = false,
    required this.createdAt,
  });

  factory Meditation.fromJson(Map<String, dynamic> json) {
    return Meditation(
      id: json['id'] as String,
      title: json['title'] as String?,
      prompt: json['prompt'] as String,
      audioUrl: json['audioUrl'] as String,
      duration: json['duration'] as int?,
      feeling: json['feeling'] as String?,
      whatHelped: json['whatHelped'] as String?,
      feedback: json['feedback'] as String?,
      isFavorite: (json['isFavorite'] as bool?) ?? false,
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
