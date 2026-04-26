class Meditation {
  final String id;
  final String? title;
  final String prompt;
  final String audioUrl;
  final int? duration;
  final String? feeling;      // calmer | same | tense
  final List<String> whatHelped; // breath | body | belly_anchor | release | silence | visualization | voice | pacing
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
    this.whatHelped = const [],
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
      whatHelped: _parseWhatHelped(json['whatHelped']),
      feedback: json['feedback'] as String?,
      isFavorite: (json['isFavorite'] as bool?) ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

List<String> _parseWhatHelped(dynamic raw) {
  if (raw is List) {
    return raw.whereType<String>().toList(growable: false);
  }
  if (raw is String && raw.isNotEmpty) {
    return [raw];
  }
  return const [];
}

class UserStats {
  final int streak;
  final int totalSessions;
  final int minutes;
  final String favoriteTime;

  const UserStats({
    required this.streak,
    required this.totalSessions,
    required this.minutes,
    required this.favoriteTime,
  });

  factory UserStats.fromJson(Map<String, dynamic> json) {
    return UserStats(
      streak: json['streak'] as int,
      totalSessions: json['totalSessions'] as int,
      minutes: (json['minutes'] as num).toInt(),
      favoriteTime: json['favoriteTime'] as String,
    );
  }
}

class CheckinResult {
  final String celebration;
  final UserStats stats;

  const CheckinResult({required this.celebration, required this.stats});

  factory CheckinResult.fromJson(Map<String, dynamic> json) {
    return CheckinResult(
      celebration: json['celebration'] as String,
      stats: UserStats.fromJson(json['stats'] as Map<String, dynamic>),
    );
  }
}
