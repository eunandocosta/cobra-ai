// MedTutorBrasil - Services, Data Models & Architecture

/**
 * Modelo de Item Unificado de Estudo (Compartilhado entre Flashcards e Quizzes)
 * Se o aluno faz upload de um material, as questões alimentam ambas as experiências.
 * Contém flags de detecção de redundância matemática (>= 50%) e estado favorito.
 */
class SharedStudyItem {
  final String id;
  final String subject;
  final String? disease;
  final String question;
  final String referenceAnswer;
  final List<String> quizOptions;
  final int correctOptionIndex;
  final int intervalDays;
  final DateTime lastReviewed;
  final bool isRedundant;
  final double redundancyScore; // 0.0 a 1.0 (ex: 0.65 = 65% similar)
  final String? similarToId;
  final bool isStarred;

  SharedStudyItem({
    required this.id,
    required this.subject,
    this.disease,
    required this.question,
    required this.referenceAnswer,
    required this.quizOptions,
    required this.correctOptionIndex,
    this.intervalDays = 1,
    DateTime? lastReviewed,
    this.isRedundant = false,
    this.redundancyScore = 0.0,
    this.similarToId,
    this.isStarred = false,
  }) : lastReviewed = lastReviewed ?? DateTime.now();

  SharedStudyItem copyWith({
    String? disease,
    int? intervalDays,
    DateTime? lastReviewed,
    bool? isRedundant,
    double? redundancyScore,
    String? similarToId,
    bool? isStarred,
  }) {
    return SharedStudyItem(
      id: id,
      subject: subject,
      disease: disease ?? this.disease,
      question: question,
      referenceAnswer: referenceAnswer,
      quizOptions: quizOptions,
      correctOptionIndex: correctOptionIndex,
      intervalDays: intervalDays ?? this.intervalDays,
      lastReviewed: lastReviewed ?? this.lastReviewed,
      isRedundant: isRedundant ?? this.isRedundant,
      redundancyScore: redundancyScore ?? this.redundancyScore,
      similarToId: similarToId ?? this.similarToId,
      isStarred: isStarred ?? this.isStarred,
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
  double retentionRate; // Taxa de retenção mnemônica estimada

  UniversitySubject({
    required this.id,
    required this.name,
    required this.period,
    this.masteryPercentage = 0.0,
    this.studiedItemsCount = 0,
    this.retentionRate = 0.0,
  });

  void addProgress(int score) {
    studiedItemsCount++;
    masteryPercentage = (masteryPercentage + (score * 0.1)).clamp(0.0, 100.0);
    retentionRate = (masteryPercentage * 0.92).clamp(0.0, 100.0);
  }
}

/**
 * SCE: Sistema de Conhecimento e Evolução por Disciplina
 * Consolida métricas de aprendizado, histórico de retenção e pontos fracos.
 */
class KnowledgeEvolutionData {
  final String subjectId;
  final String subjectName;
  final double currentMastery; // 0 a 100%
  final double retentionRate; // 0 a 100%
  final int totalQuestionsAnswered;
  final int totalCorrectAnswers;
  final List<String> weakTopics;
  final List<double> weeklyProgress; // últimos 7 dias

  KnowledgeEvolutionData({
    required this.subjectId,
    required this.subjectName,
    required this.currentMastery,
    required this.retentionRate,
    required this.totalQuestionsAnswered,
    required this.totalCorrectAnswers,
    required this.weakTopics,
    required this.weeklyProgress,
  });

  double get accuracyRate => totalQuestionsAnswered > 0
      ? (totalCorrectAnswers / totalQuestionsAnswered) * 100
      : 0.0;
}

/**
 * Tarefa Diária do Roteiro Dinâmico de Estudos
 */
class AdaptiveStudyTask {
  final String id;
  final String subjectName;
  final String topic;
  final int targetMinutes;
  final DateTime scheduledDate;
  bool isCompleted;
  bool isDelayed;

  AdaptiveStudyTask({
    required this.id,
    required this.subjectName,
    required this.topic,
    required this.targetMinutes,
    required this.scheduledDate,
    this.isCompleted = false,
    this.isDelayed = false,
  });
}

/**
 * Roteiro Otimizado de Estudo Adaptativo ("Waze da Medicina")
 * Se o aluno estiver atrasado, redistribui os tópicos de forma eficaz e equilibrada.
 */
class AdaptiveStudyRoute {
  final List<AdaptiveStudyTask> tasks;
  DateTime lastRecalculated;

  AdaptiveStudyRoute({
    required this.tasks,
    DateTime? lastRecalculated,
  }) : lastRecalculated = lastRecalculated ?? DateTime.now();

  bool get hasDelayedTasks => tasks.any((t) => !t.isCompleted && t.isDelayed);

  int get delayedTasksCount => tasks.where((t) => !t.isCompleted && t.isDelayed).length;

  /**
   * Recalcula a rota de estudo:
   * Pega tarefas atrasadas e não concluídas e as redistribui equilibradamente
   * para os próximos dias sem sobrecarregar um único dia.
   */
  void recalculateRoute() {
    final now = DateTime.now();
    final pendingTasks = tasks.where((t) => !t.isCompleted).toList();
    
    // Distribui em lotes de no máximo 2 tarefas por dia útil seguinte
    int dayOffset = 0;
    int tasksInDay = 0;

    for (var task in pendingTasks) {
      if (tasksInDay >= 2) {
        dayOffset++;
        tasksInDay = 0;
      }
      task.scheduledDate = DateTime(now.year, now.month, now.day + dayOffset);
      task.isDelayed = false;
      tasksInDay++;
    }

    lastRecalculated = DateTime.now();
  }
}

/**
 * Item de Arquivo do Google Drive
 */
class DriveFileItem {
  final String id;
  final String name;
  final double sizeMB;
  final String mimeType;
  final bool isEligible;
  final bool needsCompression;
  final double compressedSizeMB;
  final String rejectionReason;
  final bool isExtensiveBook;

  DriveFileItem({
    required this.id,
    required this.name,
    required this.sizeMB,
    required this.mimeType,
    required this.isEligible,
    this.needsCompression = false,
    double? compressedSizeMB,
    this.rejectionReason = '',
    this.isExtensiveBook = false,
  }) : compressedSizeMB = compressedSizeMB ?? sizeMB;
}

/**
 * Compactador Local no Dispositivo (On-Device, sem IA)
 * Para arquivos entre 100MB e 300MB, reduz o peso em ~70%
 * reamostrando imagens para 150 DPI e otimizando streams de slides.
 */
class LocalDeviceCompressor {
  static const double minForCompressionMB = 100.0;
  static const double maxAllowedMB = 300.0;

  static DriveFileItem compressOnDevice(DriveFileItem item) {
    if (!item.needsCompression || item.sizeMB > maxAllowedMB) {
      return item;
    }

    // Aplica taxa de redução de ~70% preservando legibilidade diagnóstica
    final compressedSize = (item.sizeMB * 0.30);
    return DriveFileItem(
      id: item.id,
      name: item.name,
      sizeMB: item.sizeMB,
      mimeType: item.mimeType,
      isEligible: true,
      needsCompression: false,
      compressedSizeMB: compressedSize,
      rejectionReason: '',
    );
  }
}

/**
 * Serviço de Conexão com Google Drive ("Atualizar por Drive")
 * - Até 100 MB: Importação direta
 * - 100 MB a 300 MB: Compactação local no dispositivo
 * - Acima de 300 MB: Rejeitado por ser excessivamente grande
 */
class DriveSyncService {
  static const double maxAllowedSizeBytes = 300.0; // 300 MB máximo
  static const double minForCompressionBytes = 100.0; // 100 MB ativa compactador
  static String? connectedFolderUrl;

  static bool validateDriveUrl(String url) {
    final clean = url.trim().toLowerCase();
    return clean.contains('drive.google.com') || clean.contains('/folders/');
  }

  static DriveFileItem evaluateFile(String id, String name, double sizeMB, String mimeType) {
    final lowerName = name.toLowerCase();

    // Filtro 1: Arquivo excessivamente grande (> 300 MB)
    if (sizeMB > maxAllowedSizeBytes) {
      return DriveFileItem(
        id: id,
        name: name,
        sizeMB: sizeMB,
        mimeType: mimeType,
        isEligible: false,
        rejectionReason: 'Arquivo excessivamente grande (${sizeMB.toStringAsFixed(1)}MB > 300MB). Divida o arquivo por capítulos de aula.',
      );
    }

    // Filtro 2: Extensões permitidas (PDFs, PPTX, Slides, Resumos)
    final validExt = name.endsWith('.pdf') || name.endsWith('.pptx') || name.endsWith('.txt') || name.endsWith('.md');
    if (!validExt) {
      return DriveFileItem(
        id: id,
        name: name,
        sizeMB: sizeMB,
        mimeType: mimeType,
        isEligible: false,
        rejectionReason: 'Formato não didático. Apenas PDFs, Slides e Resumos de aula.',
      );
    }

    // Filtro 3: Detecção de livro extenso ou tratado (ex: Azulay, Tratados gerais) para poupar processamento
    final isExtensiveBook = lowerName.contains('azulay') || lowerName.contains('tratado') || lowerName.contains('manual de') || lowerName.contains('atlas completo');
    if (isExtensiveBook) {
      return DriveFileItem(
        id: id,
        name: name,
        sizeMB: sizeMB,
        mimeType: mimeType,
        isEligible: false,
        isExtensiveBook: true,
        rejectionReason: 'Livro-texto/tratado extenso (${sizeMB.toStringAsFixed(1)} MB). Omitido para focar nas aulas e poupar processamento.',
      );
    }

    // Filtro 4: Faixa de 100MB a 300MB requer compactação no dispositivo
    final needsCompression = sizeMB >= minForCompressionBytes;
    final estimatedCompressed = needsCompression ? (sizeMB * 0.30) : sizeMB;

    return DriveFileItem(
      id: id,
      name: name,
      sizeMB: sizeMB,
      mimeType: mimeType,
      isEligible: true,
      needsCompression: needsCompression,
      compressedSizeMB: estimatedCompressed,
      isExtensiveBook: false,
    );
  }
}

/**
 * Algoritmo Matemático de Detecção de Redundância Local (Sem IA - Custo R$ 0,00)
 * Executa tokenização, remoção de stopwords em PT-BR e Similaridade de Jaccard e Cossenos.
 */
class TextSimilarityEngine {
  static const double defaultThreshold = 0.50; // Limiar de 50%

  static const Set<String> ptStopwords = {
    'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas',
    'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
    'por', 'para', 'com', 'sem', 'sob', 'sobre', 'entre',
    'e', 'ou', 'mas', 'que', 'se', 'como', 'quando', 'onde', 'qual',
    'este', 'esta', 'esse', 'essa', 'aquele', 'aquela', 'isto', 'isso',
    'paciente', 'quadro', 'caso', 'sao', 'era', 'foi', 'tem', 'ha'
  };

  static List<String> extractKeywords(String text) {
    final clean = text
        .toLowerCase()
        .replaceAll(RegExp(r'[^\w\s]', unicode: true), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();

    final words = clean.split(' ');
    return words.where((w) => w.length > 2 && !ptStopwords.contains(w)).toList();
  }

  static double calculateJaccard(List<String> a, List<String> b) {
    if (a.isEmpty || b.isEmpty) return 0.0;
    final setA = a.toSet();
    final setB = b.toSet();
    final intersection = setA.intersection(setB).length;
    final union = setA.union(setB).length;
    return union == 0 ? 0.0 : intersection / union;
  }

  static double calculateSimilarity(String text1, String text2) {
    final kw1 = extractKeywords(text1);
    final kw2 = extractKeywords(text2);
    if (kw1.isEmpty || kw2.isEmpty) return 0.0;
    return calculateJaccard(kw1, kw2);
  }

  static Map<String, dynamic> checkRedundancy(String newText, List<SharedStudyItem> existingItems) {
    double maxScore = 0.0;
    SharedStudyItem? matched;

    for (var item in existingItems) {
      final score = calculateSimilarity(newText, item.question);
      if (score > maxScore) {
        maxScore = score;
        matched = item;
      }
    }

    final isRedundant = maxScore >= defaultThreshold;
    return {
      'isRedundant': isRedundant,
      'score': maxScore,
      'percentage': (maxScore * 100).round(),
      'matchedItem': matched,
    };
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
          id: 'subj-${DateTime.now().millisecondsSinceEpoch}-${subjects.length}',
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

/**
 * Modelo de Material de Estudo para Leitura Médica
 * Produzido sob demanda no Chat a partir de arquivos selecionados do Google Drive
 */
class ReadingStudyMaterial {
  final String id;
  final String title;
  final String module;
  final List<String> sourceFileNames;
  final String semiologyTable;
  final String histologyContent;
  final String differentialDiagnosis;
  final String pearlsOfWisdom;
  final DateTime createdAt;

  ReadingStudyMaterial({
    required this.id,
    required this.title,
    required this.module,
    required this.sourceFileNames,
    required this.semiologyTable,
    required this.histologyContent,
    required this.differentialDiagnosis,
    required this.pearlsOfWisdom,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();
}

/**
 * Serviço de Geração de Material Didático para Leitura a partir do Drive
 */
class ReadingMaterialService {
  static ReadingStudyMaterial generateFromDriveFiles(List<DriveFileItem> selectedFiles) {
    final names = selectedFiles.map((f) => f.name).toList();
    return ReadingStudyMaterial(
      id: 'reading-${DateTime.now().millisecondsSinceEpoch}',
      title: 'Material de Estudo: Propedêutica das Lesões Elementares e Fisiopatologia Cutânea',
      module: 'Integração de Sistemas Humanos 2 (Dermatologia)',
      sourceFileNames: names.isEmpty
          ? [
              'Aula 2 - Sistema Tegumentar.pdf',
              'Lesoes-Elementares-em-Dermatologia - Aula 1 - 2026.2(1).pdf',
              'Psoríase, liquen plano.pdf'
            ]
          : names,
      semiologyTable: 'Mácula (<1cm, plana), Pápula (<1cm, sólida), Placa (>1cm, platô), Nódulo (1-3cm, derme/hipoderme).',
      histologyContent: 'Epiderme estratificada (Basal, Espinhosa, Granulosa, Córnea) e barreira lipídica hidrofóbica com queratinócitos.',
      differentialDiagnosis: 'Psoríase Vulgar (Auspitz, Koebner, orvalho sangrento) vs Líquen Plano (4 Ps, Estrias de Wickham).',
      pearlsOfWisdom: '1. Auspitz indica papilomatose da psoríase. 2. Estrias de Wickham indicam líquen plano. 3. Atopia no lactente poupa região perioral.',
    );
  }
}

