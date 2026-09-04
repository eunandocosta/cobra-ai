// MedTutorBrasil - Services, Data Models & Architecture

/**
 * Modelo de Item Unificado de Estudo (Compartilhado entre Flashcards e Quizzes)
 * Se o aluno faz upload de um material, as questões alimentam ambas as experiências.
 */
class SharedStudyItem {
  final String id;
  final String subject;
  final String question;
  final String referenceAnswer;
  final List<String> quizOptions;
  final int correctOptionIndex;
  final int intervalDays;
  final DateTime lastReviewed;

  SharedStudyItem({
    required this.id,
    required this.subject,
    required this.question,
    required this.referenceAnswer,
    required this.quizOptions,
    required this.correctOptionIndex,
    this.intervalDays = 1,
    DateTime? lastReviewed,
  }) : lastReviewed = lastReviewed ?? DateTime.now();

  SharedStudyItem copyWith({int? intervalDays, DateTime? lastReviewed}) {
    return SharedStudyItem(
      id: id,
      subject: subject,
      question: question,
      referenceAnswer: referenceAnswer,
      quizOptions: quizOptions,
      correctOptionIndex: correctOptionIndex,
      intervalDays: intervalDays ?? this.intervalDays,
      lastReviewed: lastReviewed ?? this.lastReviewed,
    );
  }
}

/**
 * Modelo de Disciplina do Currículo Universitário
 * Gerado dinamicamente a partir do upload da Ementa da faculdade do estudante
 */
class UniversitySubject {
  final String id;
  final String name;
  final String period; // Ex: '1º Período', 'Ciclo Clínico', etc.
  double masteryPercentage;
  int studiedItemsCount;

  UniversitySubject({
    required this.id,
    required this.name,
    required this.period,
    this.masteryPercentage = 0.0,
    this.studiedItemsCount = 0,
  });

  void addProgress(int score) {
    studiedItemsCount++;
    masteryPercentage = (masteryPercentage + (score * 0.1)).clamp(0.0, 100.0);
  }
}

/**
 * Gerenciador de Cota Gratuita da IA (Gemini 3.5 Flash-Lite)
 * Controla requisições por minuto/dia e força fallback caso atinja limite
 */
class FreeTierQuotaManager {
  static const int maxRequestsPerMinute = 20;
  int _currentUsage = 0;
  DateTime _windowStart = DateTime.now();

  bool canMakeRequest() {
    final now = DateTime.now();
    if (now.difference(_windowStart).inSeconds >= 60) {
      _currentUsage = 0;
      _windowStart = now;
    }
    return _currentUsage < maxRequestsPerMinute;
  }

  void registerRequest() {
    _currentUsage++;
  }

  int get remainingRequests => (maxRequestsPerMinute - _currentUsage).clamp(0, maxRequestsPerMinute);
}

/**
 * Parser de Ementa Universitária
 * Extrai períodos e disciplinas a partir de texto bruto ou documento enviado pelo aluno
 */
class SyllabusParser {
  static List<UniversitySubject> parseSyllabus(String rawText) {
    final List<UniversitySubject> subjects = [];
    final lines = rawText.split('\n');
    String currentPeriod = 'Ciclo Básico';

    for (var line in lines) {
      final clean = line.trim();
      if (clean.isEmpty) continue;

      if (clean.toLowerCase().contains('período') || clean.toLowerCase().contains('ano') || clean.toLowerCase().contains('ciclo')) {
        currentPeriod = clean;
      } else {
        subjects.add(UniversitySubject(
          id: 'subj-\${DateTime.now().millisecondsSinceEpoch}-\${subjects.length}',
          name: clean,
          period: currentPeriod,
        ));
      }
    }

    return subjects;
  }
}

/**
 * Memória Sintética Ultraleve entre Chats
 * Armazena tópicos condensados (3-5 linhas) consumindo mínimo espaço
 */
class CompactMemoryRecord {
  final String id;
  final String subjectId;
  final List<String> keyConcepts;
  final String differentialDiagnosis;
  final String studentGap;
  final DateTime timestamp;

  CompactMemoryRecord({
    required this.id,
    required this.subjectId,
    required this.keyConcepts,
    required this.differentialDiagnosis,
    required this.studentGap,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();
}
