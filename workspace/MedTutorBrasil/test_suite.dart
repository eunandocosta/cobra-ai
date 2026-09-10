import 'package:test/test.dart';

// ============================================================================
// DOMÍNIO E MODELOS: MEDTUTOR BRASIL
// ============================================================================

/// Ciclos da grade curricular médica brasileira (DCNs do Curso de Medicina)
enum MedicalCycle {
  cicloBasico,
  cicloClinico,
  internato,
  indefinido,
}

/// Nível de resposta do aluno na repetição espaçada (Baseado em SuperMemo-2)
enum ReviewQuality {
  blackout, // 0 - Erro total
  incorrect, // 1 - Erro com memória residual
  hard, // 2 - Resposta correta com grande esforço
  good, // 3 - Resposta correta com hesitação
  easy, // 4 - Resposta correta com facilidade
  mastered, // 5 - Domínio perfeito e instantâneo
}

/// Entidade de Flashcard Médico
class MedicalFlashcard {
  final String id;
  final String front;
  final String back;
  final String sourceCitation; // e.g., UpToDate / PubMed / SciELO
  int repetitions;
  double easeFactor;
  int intervalDays;
  DateTime nextReviewDate;

  MedicalFlashcard({
    required this.id,
    required this.front,
    required this.back,
    required this.sourceCitation,
    this.repetitions = 0,
    this.easeFactor = 2.5,
    this.intervalDays = 0,
    DateTime? nextReviewDate,
  }) : nextReviewDate = nextReviewDate ?? DateTime.now();
}

/// Algoritmo de Repetição Espaçada (SM-2 Modificado para Medicina)
class SpacedRepetitionEngine {
  static const double minimumEaseFactor = 1.3;

  MedicalFlashcard processReview({
    required MedicalFlashcard card,
    required ReviewQuality quality,
    required DateTime currentDate,
  }) {
    final q = quality.index;

    if (q < 3) {
      card.repetitions = 0;
      card.intervalDays = 1;
    } else {
      if (card.repetitions == 0) {
        card.intervalDays = 1;
      } else if (card.repetitions == 1) {
        card.intervalDays = 6;
      } else {
        card.intervalDays = (card.intervalDays * card.easeFactor).round();
      }
      card.repetitions += 1;
    }

    // Fórmula SM-2: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    card.easeFactor = card.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (card.easeFactor < minimumEaseFactor) {
      card.easeFactor = minimumEaseFactor;
    }

    card.nextReviewDate = currentDate.add(Duration(days: card.intervalDays));
    return card;
  }
}

/// Alternativa de Questão Clínica
class ClinicalAlternative {
  final String id;
  final String text;
  final bool isCorrect;
  final String clinicalRationale;

  ClinicalAlternative({
    required this.id,
    required this.text,
    required this.isCorrect,
    required this.clinicalRationale,
  });
}

/// Questão de Quiz com Raciocínio Clínico e Evidências
class ClinicalQuizQuestion {
  final String id;
  final String clinicalVignette;
  final List<ClinicalAlternative> alternatives;
  final String scientificReference;

  ClinicalQuizQuestion({
    required this.id,
    required this.clinicalVignette,
    required this.alternatives,
    required this.scientificReference,
  }) {
    assert(
      alternatives.where((a) => a.isCorrect).length == 1,
      'A questão clínica deve possuir exatamente uma alternativa correta.',
    );
  }
}

/// Motor de Avaliação e Auditoria de Quizzes
class QuizEngine {
  double calculateScorePercentage(int totalQuestions, int correctAnswers) {
    if (totalQuestions <= 0) return 0.0;
    return (correctAnswers / totalQuestions) * 100.0;
  }

  bool validateQuestionIntegrity(ClinicalQuizQuestion question) {
    if (question.clinicalVignette.trim().isEmpty) return false;
    if (question.alternatives.length < 2) return false;
    if (question.scientificReference.trim().isEmpty) return false;

    // Todas as alternativas devem conter justificativa comentada
    for (final alt in question.alternatives) {
      if (alt.clinicalRationale.trim().isEmpty) return false;
    }

    return question.alternatives.where((a) => a.isCorrect).length == 1;
  }
}

/// Sistema de Memória Contextual Ultra-Eficiente
class ContextualMemoryEngine {
  final int maxCharacterLimit;
  final Map<String, String> _storage = {};

  ContextualMemoryEngine({this.maxCharacterLimit = 400});

  String compressMedicalContext({
    required String topic,
    required List<String> coreFindings,
    required List<String> therapeuticDecisions,
  }) {
    final buffer = StringBuffer();
    buffer.write('TOPIC: $topic | ');
    buffer.write('ACHADOS: ${coreFindings.join(", ")} | ');
    buffer.write('CONDUTA: ${therapeuticDecisions.join(", ")}');

    final result = buffer.toString();
    if (result.length > maxCharacterLimit) {
      return '${result.substring(0, maxCharacterLimit - 3)}...';
    }
    return result;
  }

  void persistContext(String sessionId, String compressedSummary) {
    _storage[sessionId] = compressedSummary;
  }

  String? retrieveContext(String sessionId) {
    return _storage[sessionId];
  }
}

/// Classificador de Matérias Curriculares (Grade Nacional do Brasil)
class MedicalCurriculumClassifier {
  static final Map<String, MedicalCycle> _disciplineMap = {
    // Ciclo Básico
    'anatomia': MedicalCycle.cicloBasico,
    'histologia': MedicalCycle.cicloBasico,
    'bioquimica': MedicalCycle.cicloBasico,
    'fisiologia': MedicalCycle.cicloBasico,
    'farmacologia basica': MedicalCycle.cicloBasico,
    'imunologia': MedicalCycle.cicloBasico,

    // Ciclo Clínico
    'semiologia medica': MedicalCycle.cicloClinico,
    'patologia clinica': MedicalCycle.cicloClinico,
    'cardiologia': MedicalCycle.cicloClinico,
    'pneumologia': MedicalCycle.cicloClinico,
    'nefrologia': MedicalCycle.cicloClinico,
    'infectologia': MedicalCycle.cicloClinico,

    // Internato Médico
    'urgencia e emergencia': MedicalCycle.internato,
    'pronto-socorro': MedicalCycle.internato,
    'medicina de familia e comunidade': MedicalCycle.internato,
    'saude coletiva': MedicalCycle.internato,
    'clinica cirurgica': MedicalCycle.internato,
    'ginecologia e obstetricia': MedicalCycle.internato,
    'pediatria ambulatorial e enfermaria': MedicalCycle.internato,
  };

  MedicalCycle classifyTopic(String topicName) {
    final normalized = topicName.toLowerCase().trim();
    for (final entry in _disciplineMap.entries) {
      if (normalized.contains(entry.key)) {
        return entry.value;
      }
    }
    return MedicalCycle.indefinido;
  }
}

// ============================================================================
// SUÍTE DE TESTES AUTOMATIZADOS
// ============================================================================

void main() {
  group('MedTutorBrasil - Test Suite de Engenharia de Qualidade', () {
    // ------------------------------------------------------------------------
    // 1. REQUISITO: Repetição Espaçada de Flashcards (SM-2 Médico)
    // ------------------------------------------------------------------------
    group('1. Algoritmo de Repetição Espaçada (Spaced Repetition)', () {
      late SpacedRepetitionEngine engine;
      late DateTime baselineDate;

      setUp(() {
        engine = SpacedRepetitionEngine();
        baselineDate = DateTime(2025, 3, 30, 08, 0, 0);
      });

      test('Deve inicializar novo flashcard com intervalo 0 e Ease Factor padrão (2.5)', () {
        final card = MedicalFlashcard(
          id: 'card_insuficiencia_cardiaca',
          front: 'Qual o critério de Framinghan para congestão pulmonar?',
          back: 'Critério Maior: Estertores creptantes bibasais.',
          sourceCitation: 'UpToDate 2024: Heart Failure Clinical Presentation',
        );

        expect(card.repetitions, equals(0));
        expect(card.easeFactor, equals(2.5));
        expect(card.intervalDays, equals(0));
      });

      test('Deve agendar para 1 dia na primeira revisão bem-sucedida (Mastered)', () {
        final card = MedicalFlashcard(
          id: 'card_dengue_sinais_alarme',
          front: 'Cite 2 sinais de alarme da dengue.',
          back: 'Dor abdominal intensa e vômitos persistentes.',
          sourceCitation: 'Ministério da Saúde - Diretrizes de Arboviroses',
        );

        final updated = engine.processReview(
          card: card,
          quality: ReviewQuality.mastered,
          currentDate: baselineDate,
        );

        expect(updated.repetitions, equals(1));
        expect(updated.intervalDays, equals(1));
        expect(updated.nextReviewDate, equals(baselineDate.add(const Duration(days: 1))));
        expect(updated.easeFactor, greaterThan(2.5)); // EF aumenta para resposta perfeita
      });

      test('Deve avançar para intervalo de 6 dias na segunda revisão consecutiva correta', () {
        final card = MedicalFlashcard(
          id: 'card_dengue_sinais_alarme',
          front: 'Cite 2 sinais de alarme da dengue.',
          back: 'Dor abdominal intensa e vômitos persistentes.',
          sourceCitation: 'SciELO / Rev. Soc. Bras. Med. Trop.',
          repetitions: 1,
          intervalDays: 1,
          easeFactor: 2.6,
        );

        final updated = engine.processReview(
          card: card,
          quality: ReviewQuality.good,
          currentDate: baselineDate,
        );

        expect(updated.repetitions, equals(2));
        expect(updated.intervalDays, equals(6));
        expect(updated.nextReviewDate, equals(baselineDate.add(const Duration(days: 6))));
      });

      test('Deve resetar repetições para 0 e intervalo para 1 dia se o aluno esquecer (Blackout)', () {
        final card = MedicalFlashcard(
          id: 'card_cetoacidose_diabetica',
          front: 'Qual o valor de corte de BIC para reposição de bicarbonato na CAD?',
          back: 'pH < 6.9 ou Bicarbonato gravemente depletado.',
          sourceCitation: 'SBD / PubMed: 31289540',
          repetitions: 4,
          intervalDays: 24,
          easeFactor: 2.4,
        );

        final updated = engine.processReview(
          card: card,
          quality: ReviewQuality.blackout,
          currentDate: baselineDate,
        );

        expect(updated.repetitions, equals(0));
        expect(updated.intervalDays, equals(1));
        expect(updated.nextReviewDate, equals(baselineDate.add(const Duration(days: 1))));
        expect(updated.easeFactor, lessThan(2.4));
      });

      test('Não deve permitir que o Ease Factor caia abaixo do limite de 1.3', () {
        final card = MedicalFlashcard(
          id: 'card_farmaco_antiarritmico',
          front: 'Mecanismo de ação da Amiodarona',
          back: 'Bloqueador dos canais de potássio (Classe III)',
          sourceCitation: 'Goodman & Gilman / UpToDate',
          repetitions: 0,
          intervalDays: 1,
          easeFactor: 1.35,
        );

        final updated = engine.processReview(
          card: card,
          quality: ReviewQuality.blackout,
          currentDate: baselineDate,
        );

        expect(updated.easeFactor, equals(SpacedRepetitionEngine.minimumEaseFactor));
      });
    });

    // ------------------------------------------------------------------------
    // 2. REQUISITO: Pontuação e Integridade de Quizzes Clínicos
    // ------------------------------------------------------------------------
    group('2. Validação de Quizzes e Raciocínio Clínico', () {
      late QuizEngine quizEngine;

      setUp(() {
        quizEngine = QuizEngine();
      });

      test('Deve calcular corretamente o percentual de acertos clínicos', () {
        expect(quizEngine.calculateScorePercentage(10, 8), equals(80.0));
        expect(quizEngine.calculateScorePercentage(5, 5), equals(100.0));
        expect(quizEngine.calculateScorePercentage(4, 0), equals(0.0));
        expect(quizEngine.calculateScorePercentage(0, 0), equals(0.0));
      });

      test('Deve validar integridade estrutural e comentários com embasamento científico', () {
        final validQuestion = ClinicalQuizQuestion(
          id: 'q_sepse_01',
          clinicalVignette: 'Paciente de 68 anos dá entrada em PS com taquipneia, hipotensão e lactato elevado.',
          scientificReference: 'Surviving Sepsis Campaign 2021 / PubMed: 34599691',
          alternatives: [
            ClinicalAlternative(
              id: 'a',
              text: 'Iniciar ressuscitação volêmica com 30ml/kg de cristaloide nas primeiras 3h.',
              isCorrect: true,
              clinicalRationale: 'Recomendação forte da Surviving Sepsis Campaign para hipotensão induzida por sepse.',
            ),
            ClinicalAlternative(
              id: 'b',
              text: 'Aguardar hemoculturas antes de prescrever antibióticos.',
              isCorrect: false,
              clinicalRationale: 'Incorreto. A antibioticoterapia empírica de amplo espectro deve ser iniciada na 1ª hora.',
            ),
          ],
        );

        final isValid = quizEngine.validateQuestionIntegrity(validQuestion);
        expect(isValid, isTrue);
      });

      test('Deve invalidar questão clínica caso falte justificativa comentada em qualquer alternativa', () {
        final invalidQuestion = ClinicalQuizQuestion(
          id: 'q_iam_02',
          clinicalVignette: 'Paciente com supra de ST em DII, DIII e aVF.',
          scientificReference: 'Diretriz SBC 2023 / SciELO',
          alternatives: [
            ClinicalAlternative(
              id: 'a',
              text: 'IAM com supra de parede inferior.',
              isCorrect: true,
              clinicalRationale: 'DII, DIII e aVF refletem a parede inferior do VE irrigada pela ACD/CE.',
            ),
            ClinicalAlternative(
              id: 'b',
              text: 'IAM de parede anterior.',
              isCorrect: false,
              clinicalRationale: '', // Comentário vazio inválido
            ),
          ],
        );

        final isValid = quizEngine.validateQuestionIntegrity(invalidQuestion);
        expect(isValid, isFalse);
      });

      test('Deve falhar na asserção se houver mais de uma alternativa marcada como correta', () {
        expect(
          () => ClinicalQuizQuestion(
            id: 'q_erro_gabarito',
            clinicalVignette: 'Qual droga de escolha na anafilaxia?',
            scientificReference: 'UpToDate 2024',
            alternatives: [
              ClinicalAlternative(
                id: 'a',
                text: 'Epinefrina IM',
                isCorrect: true,
                clinicalRationale: 'Primeira linha.',
              ),
              ClinicalAlternative(
                id: 'b',
                text: 'Adrenalina Intramuscular',
                isCorrect: true, // Duplicidade de gabarito
                clinicalRationale: 'Sinônimo correto.',
              ),
            ],
          ),
          throwsA(isA<AssertionError>()),
        );
      });
    });

    // ------------------------------------------------------------------------
    // 3. REQUISITO: Persistência e Limite da Memória Resumida do Chat
    // ------------------------------------------------------------------------
    group('3. Sistema de Memória Contextual Ultra-Eficiente', () {
      late ContextualMemoryEngine memoryEngine;

      setUp(() {
        memoryEngine = ContextualMemoryEngine(maxCharacterLimit: 150);
      });

      test('Deve condensar e persistir contexto clínico preservando palavras-chave essenciais', () {
        const sessionId = 'session_pneumonia_comunitaria_01';
        final summary = memoryEngine.compressMedicalContext(
          topic: 'PAC Grave',
          coreFindings: ['CURB-65 = 3', 'Infiltrado lobar'],
          therapeuticDecisions: ['Ceftriaxona + Azitromicina'],
        );

        memoryEngine.persistContext(sessionId, summary);
        final retrieved = memoryEngine.retrieveContext(sessionId);

        expect(retrieved, isNotNull);
        expect(retrieved, contains('PAC Grave'));
        expect(retrieved, contains('CURB-65 = 3'));
        expect(retrieved, contains('Ceftriaxona + Azitromicina'));
        expect(retrieved!.length, lessThanOrEqualTo(150));
      });

      test('Deve truncar de forma segura adicionando reticências se o resumo exceder o limite', () {
        const longTopic = 'Caso complexo de Glomerulonefrite Rapidamente Progressiva com ANCA positivo';
        final summary = memoryEngine.compressMedicalContext(
          topic: longTopic,
          coreFindings: ['Hematúria Dismórfica', 'Proteinúria Maciça', 'Crescentes glomerulares em biópsia renal'],
          therapeuticDecisions: ['Pulsoterapia com Metilprednisolona', 'Ciclofosfamida', 'Plasmaférese de resgate'],
        );

        expect(summary.length, equals(150));
        expect(summary.endsWith('...'), isTrue);
      });

      test('Deve retornar nulo para sessões inexistentes sem lançar exceções', () {
        final result = memoryEngine.retrieveContext('sessao_inexistente');
        expect(result, isNull);
      });
    });

    // ------------------------------------------------------------------------
    // 4. REQUISITO: Categorização Curricular Brasileira (DCNs Medicina)
    // ------------------------------------------------------------------------
    group('4. Categorização de Matérias na Grade Curricular Médica', () {
      late MedicalCurriculumClassifier classifier;

      setUp(() {
        classifier = MedicalCurriculumClassifier();
      });

      test('Deve classificar disciplinas no Ciclo Básico', () {
        expect(
          classifier.classifyTopic('Revisão de Fisiologia Cardíaca e Potencial de Ação'),
          equals(MedicalCycle.cicloBasico),
        );
        expect(
          classifier.classifyTopic('Mecanismo Enzimático na Bioquímica'),
          equals(MedicalCycle.cicloBasico),
        );
        expect(
          classifier.classifyTopic('Anatomia do Plexo Braquial'),
          equals(MedicalCycle.cicloBasico),
        );
      });

      test('Deve classificar especialidades no Ciclo Clínico', () {
        expect(
          classifier.classifyTopic('Semiologia Médica: Ausculta Pulmonar e Roncos'),
          equals(MedicalCycle.cicloClinico),
        );
        expect(
          classifier.classifyTopic('Cardiologia: Fibrilação Atrial e Escore CHA2DS2-VASc'),
          equals(MedicalCycle.cicloClinico),
        );
        expect(
          classifier.classifyTopic('Patologia Clínica: Análise do Líquor no Diagnóstico de Meningite'),
          equals(MedicalCycle.cicloClinico),
        );
      });

      test('Deve classificar estágios práticos no Internato Médico', () {
        expect(
          classifier.classifyTopic('Urgência e Emergência: Parada Cardiorrespiratória e ACLS'),
          equals(MedicalCycle.internato),
        );
        expect(
          classifier.classifyTopic('Medicina de Família e Comunidade: Rastreamento em UBS'),
          equals(MedicalCycle.internato),
        );
        expect(
          classifier.classifyTopic('Ginecologia e Obstetrícia: Partograma e Distocias'),
          equals(MedicalCycle.internato),
        );
      });

      test('Deve retornar indefinido quando a matéria não estiver mapeada', () {
        expect(
          classifier.classifyTopic('Astrologia Médica'),
          equals(MedicalCycle.indefinido),
        );
      });
    });
  });
}