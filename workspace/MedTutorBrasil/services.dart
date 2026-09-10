import 'dart:async';
import 'dart:convert';
import 'dart:math';

/// ============================================================================
/// ENUMS & DOMÍNIO DO CURRÍCULO MÉDICO BRASILEIRO
/// ============================================================================

enum MedicalCycle {
  cicloBasico('Ciclo Básico'),
  cicloClinico('Ciclo Clínico'),
  internato('Internato');

  final String label;
  const MedicalCycle(this.label);
}

enum LiteratureSource {
  pubMed('PubMed / MEDLINE'),
  scielo('SciELO Brasil'),
  cochrane('Cochrane Database of Systematic Reviews'),
  upToDate('UpToDate Evidence-Based Clinical Decisions'),
  diretrizesSBC('Diretrizes SBC/AMB');

  final String displayName;
  const LiteratureSource(this.displayName);
}

/// ============================================================================
/// MODELOS DE DADOS
/// ============================================================================

/// Representa uma disciplina e seu progresso na matriz curricular médica brasileira
class CurriculumSubject {
  final String id;
  final String name;
  final MedicalCycle cycle;
  final double masteryScore; // 0.0 a 100.0%
  final int totalInteractions;
  final List<String> masteredKeyTopics;

  CurriculumSubject({
    required this.id,
    required this.name,
    required this.cycle,
    this.masteryScore = 0.0,
    this.totalInteractions = 0,
    List<String>? masteredKeyTopics,
  }) : masteredKeyTopics = masteredKeyTopics ?? [];

  CurriculumSubject copyWith({
    double? masteryScore,
    int? totalInteractions,
    List<String>? masteredKeyTopics,
  }) {
    return CurriculumSubject(
      id: id,
      name: name,
      cycle: cycle,
      masteryScore: masteryScore ?? this.masteryScore,
      totalInteractions: totalInteractions ?? this.totalInteractions,
      masteredKeyTopics: masteredKeyTopics ?? this.masteredKeyTopics,
    );
  }

  Map<String, dynamic> toMap() => {
        'id': id,
        'name': name,
        'cycle': cycle.name,
        'masteryScore': masteryScore,
        'totalInteractions': totalInteractions,
        'masteredKeyTopics': masteredKeyTopics,
      };

  factory CurriculumSubject.fromMap(Map<String, dynamic> map) => CurriculumSubject(
        id: map['id'] as String,
        name: map['name'] as String,
        cycle: MedicalCycle.values.byName(map['cycle'] as String),
        masteryScore: (map['masteryScore'] as num).toDouble(),
        totalInteractions: map['totalInteractions'] as int,
        masteredKeyTopics: List<String>.from(map['masteredKeyTopics'] ?? []),
      );
}

/// Registro ultra-compacto de memória cross-chat para economia de tokens em prompts
class CompactMemoryRecord {
  final String id;
  final String chatId;
  final String subjectId;
  final List<String> keyConcepts; // Conceitos fixados em 1 linha
  final List<String> diagnosticPointers; // Gatilhos diagnósticos
  final List<String> learningGaps; // Lacunas a reforçar futuramente
  final DateTime timestamp;

  CompactMemoryRecord({
    required this.id,
    required this.chatId,
    required this.subjectId,
    required this.keyConcepts,
    required this.diagnosticPointers,
    required this.learningGaps,
    required this.timestamp,
  });

  /// Serialização ultracompacta no formato pipeline para injeção eficiente de contexto no LLM
  String toTokenEfficientSummary() {
    final conc = keyConcepts.take(3).join('; ');
    final diag = diagnosticPointers.take(2).join('; ');
    final gaps = learningGaps.take(2).join('; ');
    return '[$subjectId|Conc:$conc|Diag:$diag|Gaps:$gaps]';
  }

  Map<String, dynamic> toMap() => {
        'id': id,
        'chatId': chatId,
        'subjectId': subjectId,
        'keyConcepts': keyConcepts,
        'diagnosticPointers': diagnosticPointers,
        'learningGaps': learningGaps,
        'timestamp': timestamp.toIso8601String(),
      };

  factory CompactMemoryRecord.fromMap(Map<String, dynamic> map) => CompactMemoryRecord(
        id: map['id'] as String,
        chatId: map['chatId'] as String,
        subjectId: map['subjectId'] as String,
        keyConcepts: List<String>.from(map['keyConcepts'] ?? []),
        diagnosticPointers: List<String>.from(map['diagnosticPointers'] ?? []),
        learningGaps: List<String>.from(map['learningGaps'] ?? []),
        timestamp: DateTime.parse(map['timestamp'] as String),
      );
}

/// Item de Flashcard clínico baseado no algoritmo SuperMemo SM-2 simplificado
class FlashcardItem {
  final String id;
  final String subjectId;
  final String medicalSpecialty;
  final String clinicalQuestion;
  final String groundedAnswer;
  final String referenceEvidence;
  final int repetitionCount;
  final int consecutiveCorrect;
  final double easeFactor; // SM-2 padrão inicial = 2.5
  final int intervalDays;
  final DateTime nextReviewDate;

  FlashcardItem({
    required this.id,
    required this.subjectId,
    required this.medicalSpecialty,
    required this.clinicalQuestion,
    required this.groundedAnswer,
    required this.referenceEvidence,
    this.repetitionCount = 0,
    this.consecutiveCorrect = 0,
    this.easeFactor = 2.5,
    this.intervalDays = 0,
    DateTime? nextReviewDate,
  }) : nextReviewDate = nextReviewDate ?? DateTime.now();

  /// Atualiza o ciclo de repetição espaçada SM-2 (Grau de qualidade da resposta: 0 a 5)
  FlashcardItem processReview(int qualityGrade) {
    assert(qualityGrade >= 0 && qualityGrade <= 5);

    double newEase = easeFactor + (0.1 - (5 - qualityGrade) * (0.08 + (5 - qualityGrade) * 0.02));
    if (newEase < 1.3) newEase = 1.3;

    int newConsecutive = qualityGrade >= 3 ? consecutiveCorrect + 1 : 0;
    int newInterval;

    if (newConsecutive == 0) {
      newInterval = 1;
    } else if (newConsecutive == 1) {
      newInterval = 1;
    } else if (newConsecutive == 2) {
      newInterval = 6;
    } else {
      newInterval = (intervalDays * newEase).round();
    }

    return FlashcardItem(
      id: id,
      subjectId: subjectId,
      medicalSpecialty: medicalSpecialty,
      clinicalQuestion: clinicalQuestion,
      groundedAnswer: groundedAnswer,
      referenceEvidence: referenceEvidence,
      repetitionCount: repetitionCount + 1,
      consecutiveCorrect: newConsecutive,
      easeFactor: newEase,
      intervalDays: newInterval,
      nextReviewDate: DateTime.now().add(Duration(days: newInterval)),
    );
  }

  Map<String, dynamic> toMap() => {
        'id': id,
        'subjectId': subjectId,
        'medicalSpecialty': medicalSpecialty,
        'clinicalQuestion': clinicalQuestion,
        'groundedAnswer': groundedAnswer,
        'referenceEvidence': referenceEvidence,
        'repetitionCount': repetitionCount,
        'consecutiveCorrect': consecutiveCorrect,
        'easeFactor': easeFactor,
        'intervalDays': intervalDays,
        'nextReviewDate': nextReviewDate.toIso8601String(),
      };

  factory FlashcardItem.fromMap(Map<String, dynamic> map) => FlashcardItem(
        id: map['id'] as String,
        subjectId: map['subjectId'] as String,
        medicalSpecialty: map['medicalSpecialty'] as String,
        clinicalQuestion: map['clinicalQuestion'] as String,
        groundedAnswer: map['groundedAnswer'] as String,
        referenceEvidence: map['referenceEvidence'] as String,
        repetitionCount: map['repetitionCount'] as int,
        consecutiveCorrect: map['consecutiveCorrect'] as int,
        easeFactor: (map['easeFactor'] as num).toDouble(),
        intervalDays: map['intervalDays'] as int,
        nextReviewDate: DateTime.parse(map['nextReviewDate'] as String),
      );
}

/// Questão de Quiz com Caso Clínico e Resolução Comentada
class QuizQuestion {
  final String id;
  final String subjectId;
  final String clinicalCase;
  final List<String> options; // Letras A, B, C, D
  final int correctOptionIndex;
  final String detailedScientificJustification;
  final List<String> bibliographicCitations;

  QuizQuestion({
    required this.id,
    required this.subjectId,
    required this.clinicalCase,
    required this.options,
    required this.correctOptionIndex,
    required this.detailedScientificJustification,
    required this.bibliographicCitations,
  });

  bool evaluateAnswer(int selectedIndex) => selectedIndex == correctOptionIndex;

  Map<String, dynamic> toMap() => {
        'id': id,
        'subjectId': subjectId,
        'clinicalCase': clinicalCase,
        'options': options,
        'correctOptionIndex': correctOptionIndex,
        'detailedScientificJustification': detailedScientificJustification,
        'bibliographicCitations': bibliographicCitations,
      };

  factory QuizQuestion.fromMap(Map<String, dynamic> map) => QuizQuestion(
        id: map['id'] as String,
        subjectId: map['subjectId'] as String,
        clinicalCase: map['clinicalCase'] as String,
        options: List<String>.from(map['options'] ?? []),
        correctOptionIndex: map['correctOptionIndex'] as int,
        detailedScientificJustification: map['detailedScientificJustification'] as String,
        bibliographicCitations: List<String>.from(map['bibliographicCitations'] ?? []),
      );
}

/// Resultado Estruturado de Revisão Bibliográfica com Estilo Socrático
class LiteratureSynthesis {
  final String topic;
  final String subjectId;
  final String executiveSummary;
  final List<String> keyEvidencePoints;
  final List<String> socraticReflectiveQuestions;
  final List<Map<String, String>> references; // [{'source': '...', 'title': '...', 'doi': '...'}]

  LiteratureSynthesis({
    required this.topic,
    required this.subjectId,
    required this.executiveSummary,
    required this.keyEvidencePoints,
    required this.socraticReflectiveQuestions,
    required this.references,
  });
}

/// ============================================================================
/// SERVIÇO PRINCIPAL: MEDICAL KNOWLEDGE SERVICE
/// ============================================================================

class MedicalKnowledgeService {
  // Armazenamento em memória local (Cache/State)
  final Map<String, CurriculumSubject> _curriculumDatabase = {};
  final List<CompactMemoryRecord> _memoryStorage = [];
  final List<FlashcardItem> _flashcardStorage = [];
  final List<QuizQuestion> _quizStorage = [];

  MedicalKnowledgeService() {
    _initializeBrazilianCurriculum();
  }

  /// Inicializa a matriz das Diretrizes Curriculares Nacionais (DCN) do Curso de Medicina
  void _initializeBrazilianCurriculum() {
    final List<CurriculumSubject> initialSubjects = [
      // Ciclo Básico
      CurriculumSubject(id: 'anat_hum', name: 'Anatomia Humana', cycle: MedicalCycle.cicloBasico),
      CurriculumSubject(id: 'fisiol_hum', name: 'Fisiologia Médica', cycle: MedicalCycle.cicloBasico),
      CurriculumSubject(id: 'farmaco', name: 'Farmacologia Básica e Clínica', cycle: MedicalCycle.cicloBasico),
      CurriculumSubject(id: 'patol_geral', name: 'Patologia Geral e Sistêmica', cycle: MedicalCycle.cicloBasico),
      CurriculumSubject(id: 'micro_imuno', name: 'Microbiologia e Imunologia', cycle: MedicalCycle.cicloBasico),

      // Ciclo Clínico
      CurriculumSubject(id: 'semio_med', name: 'Semiologia e Propedêutica Médica', cycle: MedicalCycle.cicloClinico),
      CurriculumSubject(id: 'clin_med', name: 'Clínica Médica', cycle: MedicalCycle.cicloClinico),
      CurriculumSubject(id: 'cirurg_geral', name: 'Cirurgia Geral e Propedêutica Cirúrgica', cycle: MedicalCycle.cicloClinico),
      CurriculumSubject(id: 'pediatria', name: 'Pediatria e Puericultura', cycle: MedicalCycle.cicloClinico),
      CurriculumSubject(id: 'ginec_obst', name: 'Ginecologia e Obstetrícia', cycle: MedicalCycle.cicloClinico),
      CurriculumSubject(id: 'saude_coletiva', name: 'Saúde Coletiva e Epidemiologia', cycle: MedicalCycle.cicloClinico),

      // Internato
      CurriculumSubject(id: 'int_urgencia', name: 'Internato em Urgência e Emergência', cycle: MedicalCycle.internato),
      CurriculumSubject(id: 'int_mfc', name: 'Internato em Atenção Básica (Medicina de Família)', cycle: MedicalCycle.internato),
      CurriculumSubject(id: 'int_clinica', name: 'Internato em Clínica Médica / UTI', cycle: MedicalCycle.internato),
      CurriculumSubject(id: 'int_cirurgia', name: 'Internato em Clínica Cirúrgica', cycle: MedicalCycle.internato),
      CurriculumSubject(id: 'int_go', name: 'Internato em Ginecologia e Obstetrícia', cycle: MedicalCycle.internato),
      CurriculumSubject(id: 'int_ped', name: 'Internato em Pediatria', cycle: MedicalCycle.internato),
    ];

    for (var s in initialSubjects) {
      _curriculumDatabase[s.id] = s;
    }
  }

  /// 1. Classificação automática de pergunta do aluno na disciplina da matriz curricular brasileira
  Future<CurriculumSubject> classifyQuerySubject(String query) async {
    final lowerQuery = query.toLowerCase();

    // Mapeamento heurístico semântico
    if (lowerQuery.contains('coração') || lowerQuery.contains('infarto') || lowerQuery.contains('dispneia') || lowerQuery.contains('ecg') || lowerQuery.contains('hipertens')) {
      return _curriculumDatabase['clin_med'] ?? _curriculumDatabase.values.first;
    }
    if (lowerQuery.contains('antagonista') || lowerQuery.contains('receptor') || lowerQuery.contains('dose') || lowerQuery.contains('farmaco') || lowerQuery.contains('meia-vida')) {
      return _curriculumDatabase['farmaco'] ?? _curriculumDatabase.values.first;
    }
    if (lowerQuery.contains('ausculta') || lowerQuery.contains('sopro') || lowerQuery.contains('anamnese') || lowerQuery.contains('palpação') || lowerQuery.contains('sinal de')) {
      return _curriculumDatabase['semio_med'] ?? _curriculumDatabase.values.first;
    }
    if (lowerQuery.contains('parto') || lowerQuery.contains('gestante') || lowerQuery.contains('sangramento vaginal') || lowerQuery.contains('pré-natal')) {
      return _curriculumDatabase['ginec_obst'] ?? _curriculumDatabase.values.first;
    }
    if (lowerQuery.contains('criança') || lowerQuery.contains('lactente') || lowerQuery.contains('vacinação') || lowerQuery.contains('desidratação infantil')) {
      return _curriculumDatabase['pediatria'] ?? _curriculumDatabase.values.first;
    }
    if (lowerQuery.contains('apendicite') || lowerQuery.contains('abdome agudo') || lowerQuery.contains('laparotomia') || lowerQuery.contains('fios de sutura')) {
      return _curriculumDatabase['cirurg_geral'] ?? _curriculumDatabase.values.first;
    }
    if (lowerQuery.contains('choque') || lowerQuery.contains('intubação') || lowerQuery.contains('parada cardiorrespiratória') || lowerQuery.contains('acls')) {
      return _curriculumDatabase['int_urgencia'] ?? _curriculumDatabase.values.first;
    }
    if (lowerQuery.contains('potencial de ação') || lowerQuery.contains('néfron') || lowerQuery.contains('filtração glomerular')) {
      return _curriculumDatabase['fisiol_hum'] ?? _curriculumDatabase.values.first;
    }

    // Default fallback: Clínica Médica
    return _curriculumDatabase['clin_med']!;
  }

  /// 2. Busca e estruturação de revisão com bases científicas e perguntas socráticas reflexivas
  Future<LiteratureSynthesis> searchScientificLiterature(String query) async {
    final classifiedSubject = await classifyQuerySubject(query);

    // Simulação com padrão de alta fidelidade acadêmica (PubMed, SciELO, UpToDate)
    return LiteratureSynthesis(
      topic: query,
      subjectId: classifiedSubject.id,
      executiveSummary:
          'Com base nas evidências consolidadas recentes, a abordagem diagnóstica e terapêutica de "$query" '
          'exige correlação fisiopatológica rigorosa e estratificação de risco imediata.',
      keyEvidencePoints: [
        'A fisiopatologia central envolve disfunção endotelial e resposta inflamatória mediada por citocinas.',
        'O padrão-ouro propedêutico prioriza exames de imagem e biomarcadores nas primeiras 6 horas.',
        'A intervenção precoce reduz o desfecho primário de mortalidade em 28% conforme ensaios clínicos randomizados recentes.',
      ],
      socraticReflectiveQuestions: [
        'Qual seria o mecanismo farmacológico que justificaria não utilizar betabloqueadores agudamente em caso de descompensação com congestão pulmonar grave?',
        'Diante desse quadro, quais achados da semiologia física descartariam diagnósticos diferenciais cirúrgicos imediatos?',
      ],
      references: [
        {
          'source': LiteratureSource.pubMed.displayName,
          'title': 'Evidence-based management and therapeutic updates on $query: a systematic review.',
          'doi': '10.1016/j.medsci.2023.08.012',
        },
        {
          'source': LiteratureSource.scielo.displayName,
          'title': 'Diretrizes Clínicas e Epidemiologia no Contexto do SUS para $query.',
          'doi': '10.1590/S0104-42302022000400010',
        },
        {
          'source': LiteratureSource.upToDate.displayName,
          'title': 'Clinical approach, differential diagnosis, and current protocols for $query.',
          'doi': 'UTD-REF-994821',
        },
      ],
    );
  }

  /// 3. Salva a memória condensada ultra-eficiente de uma sessão de chat
  Future<CompactMemoryRecord> saveChatMemory({
    required String chatId,
    required String subjectId,
    required List<String> concepts,
    List<String> pointers = const [],
    List<String> gaps = const [],
  }) async {
    final record = CompactMemoryRecord(
      id: 'mem_${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(1000)}',
      chatId: chatId,
      subjectId: subjectId,
      keyConcepts: concepts,
      diagnosticPointers: pointers,
      learningGaps: gaps,
      timestamp: DateTime.now(),
    );

    _memoryStorage.add(record);
    _updateSubjectDominance(subjectId, concepts);

    return record;
  }

  /// 4. Recupera memórias anteriores condensadas para re-injeção no contexto do Chat
  Future<String> getRelevantMemoriesForChat(String subjectId) async {
    final relevant = _memoryStorage
        .where((m) => m.subjectId == subjectId)
        .toList()
      ..sort((a, b) => b.timestamp.compareTo(a.timestamp));

    if (relevant.isEmpty) return '';

    // Agrega apenas os 4 registros mais recentes em string ultra-condensada
    final compactLines = relevant.take(4).map((m) => m.toTokenEfficientSummary()).toList();
    return compactLines.join('\n');
  }

  /// 5. Criação Direta de Flashcard (a partir do Chat ou Aba Dedicada)
  Future<FlashcardItem> createFlashcard({
    required String subjectId,
    required String specialty,
    required String question,
    required String groundedAnswer,
    required String reference,
  }) async {
    final card = FlashcardItem(
      id: 'fc_${DateTime.now().millisecondsSinceEpoch}',
      subjectId: subjectId,
      medicalSpecialty: specialty,
      clinicalQuestion: question,
      groundedAnswer: groundedAnswer,
      referenceEvidence: reference,
    );

    _flashcardStorage.add(card);
    return card;
  }

  /// 6. Geração de Quiz Clínico Baseado em Evidências
  Future<QuizQuestion> generateClinicalQuiz(String subjectId, String topic) async {
    final quiz = QuizQuestion(
      id: 'qz_${DateTime.now().millisecondsSinceEpoch}',
      subjectId: subjectId,
      clinicalCase:
          'Paciente de 58 anos, hipertenso e diabético, dá entrada na sala de emergência com dor precordial em aperto, '
          'iniciada há 2 horas, irradiada para mandíbula e membro superior esquerdo. ECG evidencia supradesnivelamento '
          'do segmento ST de 2.5 mm em derivações V1-V4. PA: 150/90 mmHg, FC: 88 bpm.',
      options: [
        'A) Administrar imediatamente trombolítico venoso independente do tempo porta-balão.',
        'B) Encaminhar para cineangiocoronariografia de urgência com angioplastia primária (tempo meta < 90-120 min).',
        'C) Solicitar dosagem seriada de troponina ultrassensível antes de qualquer intervenção intervencionista.',
        'D) Prescrever apenas nitrato sublingual e observar por 6 horas na enfermaria.',
      ],
      correctOptionIndex: 1,
      detailedScientificJustification:
          'Segundo as Diretrizes da SBC e AHA/ACC sobre IAM com supra de ST (IAMCSST), a angioplastia coronária transluminal '
          'primária é a estratégia de reperfusão preferencial quando pode ser realizada dentro da janela de tempo meta (< 90 min '
          'em serviço com hemodinâmica ou < 120 min se transferido). Não se deve aguardar marcadores de necrose miocárdica '
          'para indicar a reperfusão diante de ECG diagnóstico clássico.',
      bibliographicCitations: [
        'Diretriz da Sociedade Brasileira de Cardiologia sobre Tratamento do IAM com Supradesnível do Segmento ST (2020)',
        'UpToDate: Initial evaluation and management of suspected acute myocardial infarction (2023)',
      ],
    );

    _quizStorage.add(quiz);
    return quiz;
  }

  /// 7. Processamento de acerto do aluno em Flashcard / Quiz atualizando domínio da matéria
  void _updateSubjectDominance(String subjectId, List<String> newlyMasteredTopics) {
    final subject = _curriculumDatabase[subjectId];
    if (subject == null) return;

    final updatedInteractions = subject.totalInteractions + 1;
    final updatedScore = min(100.0, subject.masteryScore + 2.5);
    final allTopics = {...subject.masteredKeyTopics, ...newlyMasteredTopics}.toList();

    _curriculumDatabase[subjectId] = subject.copyWith(
      totalInteractions: updatedInteractions,
      masteryScore: updatedScore,
      masteredKeyTopics: allTopics,
    );
  }

  /// Getters para consumo pelas interfaces/controllers
  List<CurriculumSubject> getAllSubjects() => _curriculumDatabase.values.toList();

  List<CurriculumSubject> getSubjectsByCycle(MedicalCycle cycle) =>
      _curriculumDatabase.values.where((s) => s.cycle == cycle).toList();

  List<FlashcardItem> getPendingFlashcards() {
    final now = DateTime.now();
    return _flashcardStorage.where((f) => f.nextReviewDate.isBefore(now) || f.repetitionCount == 0).toList();
  }

  List<QuizQuestion> getAllQuizzes() => List.unmodifiable(_quizStorage);
}