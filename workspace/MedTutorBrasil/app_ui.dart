import 'dart:math';
import 'package:flutter/material.dart';

void main() {
  runApp(const MedTutorApp());
}

class MedTutorApp extends StatelessWidget {
  const MedTutorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MedTutorBrasil',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF006A6B),
          primary: const Color(0xFF006A6B),
          onPrimary: Colors.white,
          primaryContainer: const Color(0xFFB4ECEE),
          onPrimaryContainer: const Color(0xFF002021),
          secondary: const Color(0xFF4A6363),
          surface: const Color(0xFFF7FAF9),
          surfaceVariant: const Color(0xFFDAE5E4),
          background: const Color(0xFFF3F7F6),
        ),
        scaffoldBackgroundColor: const Color(0xFFF3F7F6),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF006A6B),
          foregroundColor: Colors.white,
          elevation: 0,
          centerTitle: true,
        ),
        cardTheme: CardTheme(
          elevation: 1,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          color: Colors.white,
        ),
        fontFamily: 'Roboto',
      ),
      home: const MainNavigationScreen(),
    );
  }
}

// -----------------------------------------------------------------------------
// MAIN NAVIGATION WRAPPER
// -----------------------------------------------------------------------------
class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;

  final List<Widget> _views = const [
    ScientificChatView(),
    FlashcardsView(),
    QuizzesView(),
    CurriculumView(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _views,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (int index) {
          setState(() {
            _currentIndex = index;
          });
        },
        backgroundColor: Colors.white,
        elevation: 8,
        indicatorColor: const Color(0xFFB4ECEE),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.forum_outlined),
            selectedIcon: Icon(Icons.forum, color: Color(0xFF006A6B)),
            label: 'Chat Científico',
          ),
          NavigationDestination(
            icon: Icon(Icons.style_outlined),
            selectedIcon: Icon(Icons.style, color: Color(0xFF006A6B)),
            label: 'Flashcards',
          ),
          NavigationDestination(
            icon: Icon(Icons.quiz_outlined),
            selectedIcon: Icon(Icons.quiz, color: Color(0xFF006A6B)),
            label: 'Quizzes',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_tree_outlined),
            selectedIcon: Icon(Icons.account_tree, color: Color(0xFF006A6B)),
            label: 'Matérias (DCNs)',
          ),
        ],
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// TAB 0: SCIENTIFIC CHAT VIEW
// -----------------------------------------------------------------------------
class ChatMessage {
  final String sender; // 'student' or 'tutor'
  final String text;
  final String? references;
  final String? socraticQuestion;
  final String subject;
  final DateTime timestamp;

  ChatMessage({
    required this.sender,
    required this.text,
    this.references,
    this.socraticQuestion,
    required this.subject,
    required this.timestamp,
  });
}

class ScientificChatView extends StatefulWidget {
  const ScientificChatView({super.key});

  @override
  State<ScientificChatView> createState() => _ScientificChatViewState();
}

class _ScientificChatViewState extends State<ScientificChatView> {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  final List<ChatMessage> _messages = [
    ChatMessage(
      sender: 'student',
      text: 'Qual é o manejo imediato inicial da Insuficiência Cardíaca Aguda descompensada perfil B (quente e úmido)?',
      subject: 'Clínica Médica / Cardiologia',
      timestamp: DateTime.now().subtract(const Duration(minutes: 10)),
    ),
    ChatMessage(
      sender: 'tutor',
      text:
          '**Revisão Baseada em Evidências:**\nO paciente em Perfil B (congesto e bem perfundido) apresenta congestão pulmonar predominante. A prioridade terapêutica visa alívio de volemia e pré/pós-carga.\n\n'
          '1. **Furosemida IV:** Bolus inicial (1-2x a dose oral prévia). Reduz a pré-carga por venodilatação imediata e diurese subsequente.\n'
          '2. **Vasodilatadores (Nitroglicerina/Nitroprussiato):** Indicados se PAS > 110 mmHg para redução de pós-carga e melhora do débito.\n'
          '3. **VNI (CPAP/BiPAP):** Precoce se dispneia intensa ou hipoxemia para recrutar alvéolos e reduzir esforço ventilatório.',
      references: '• Diretriz SBC de Insuficiência Cardíaca (2021)\n• NEJM 2022; 387:1079-1091 (Acute Heart Failure Management)\n• PubMed ID: 34561289',
      socraticQuestion: 'Qual parâmetro hemodinâmico e renal você monitoraria na primeira hora para decidir entre titular vasodilatador ou aumentar diurético?',
      subject: 'Cardiologia',
      timestamp: DateTime.now().subtract(const Duration(minutes: 9)),
    ),
  ];

  void _handleSend() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _messages.add(
        ChatMessage(
          sender: 'student',
          text: text,
          subject: 'Geral',
          timestamp: DateTime.now(),
        ),
      );
      _textController.clear();
    });

    _scrollToBottom();

    // Resposta automatica simulando IA medica
    Future.delayed(const Duration(milliseconds: 1000), () {
      setState(() {
        _messages.add(
          ChatMessage(
            sender: 'tutor',
            text:
                '**Revisão Clínica Concisa:**\nAnálise baseada nas diretrizes vigentes e meta-análises de alto impacto do UpToDate e Lancet.\n\nA abordagem padronizada foca na estratificação de risco imediata, estabilização dos sinais vitais e intervenção farmacológica guiada por metas terapêuticas estritas.',
            references: '• The Lancet (2023) - Clinical Review Series\n• UpToDate 2024.1 - Evidence Summaries\n• SciELO Brasil - Consenso Nacional',
            socraticQuestion: 'Diante do quadro acima, se o paciente evoluísse com hipotensão refratária, qual seria a droga vasoativa de primeira escolha?',
            subject: 'Medicina de Emergência',
            timestamp: DateTime.now(),
          ),
        );
      });
      _scrollToBottom();
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          children: const [
            Text('MedTutor - Chat Científico', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            Text('Memória Contextual Ativa • PubMed / SciELO / UpToDate', style: TextStyle(fontSize: 11, color: Colors.white70)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.history_edu),
            tooltip: 'Resumo de Memória Contextual',
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Memória Sintética Ativa: 4 tokens comprimidos (Cardiologia / Perfil Hemodinâmico B).'),
                  backgroundColor: Color(0xFF006A6B),
                ),
              );
            },
          )
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(14),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final message = _messages[index];
                return message.sender == 'student'
                    ? _buildStudentBubble(message)
                    : _buildTutorBubble(message);
              },
            ),
          ),
          _buildInputBar(),
        ],
      ),
    );
  }

  Widget _buildStudentBubble(ChatMessage msg) {
    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12, left: 48),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF006A6B),
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(16),
            topRight: Radius.circular(16),
            bottomLeft: Radius.circular(16),
          ),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4, offset: const Offset(0, 2))
          ],
        ),
        child: Text(
          msg.text,
          style: const TextStyle(color: Colors.white, fontSize: 14.5, height: 1.3),
        ),
      ),
    );
  }

  Widget _buildTutorBubble(ChatMessage msg) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 14, right: 32),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(16),
            topRight: Radius.circular(16),
            bottomRight: Radius.circular(16),
          ),
          border: Border.all(color: const Color(0xFFDAE5E4)),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 6, offset: const Offset(0, 2))
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header do Tutor
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: const BoxDecoration(
                color: Color(0xFFF0F7F7),
                borderRadius: BorderRadius.only(topLeft: Radius.circular(16), topRight: Radius.circular(16)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.medical_services_rounded, size: 16, color: Color(0xFF006A6B)),
                  const SizedBox(width: 6),
                  Text(
                    'Revisão Tutoria • ${msg.subject}',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF006A6B)),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    msg.text,
                    style: const TextStyle(fontSize: 14, height: 1.4, color: Color(0xFF1E2929)),
                  ),
                  if (msg.references != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF7FAF9),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFE2EBEA)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: const [
                              Icon(Icons.menu_book, size: 14, color: Color(0xFF4A6363)),
                              SizedBox(width: 4),
                              Text('Fontes & Evidências:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11, color: Color(0xFF4A6363))),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(msg.references!, style: const TextStyle(fontSize: 11.5, color: Color(0xFF4A6363), height: 1.3)),
                        ],
                      ),
                    ),
                  ],
                  if (msg.socraticQuestion != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE6F4F4),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFB4ECEE)),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.psychology_alt, size: 18, color: Color(0xFF006A6B)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Pergunta Socrática de Fixação:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF006A6B))),
                                const SizedBox(height: 2),
                                Text(msg.socraticQuestion!, style: const TextStyle(fontSize: 12.5, color: Color(0xFF004D4E), fontStyle: FontStyle.italic)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  // Botoes de Acao Rapida
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      OutlinedButton.icon(
                        icon: const Icon(Icons.style, size: 15, color: Color(0xFF006A6B)),
                        label: const Text('+ Gerar Flashcard', style: TextStyle(fontSize: 12, color: Color(0xFF006A6B), fontWeight: FontWeight.bold)),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Color(0xFF006A6B)),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        onPressed: () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Flashcard salvo na matéria correspondente! Acesse na aba Flashcards.'),
                              duration: Duration(seconds: 2),
                              backgroundColor: Color(0xFF006A6B),
                            ),
                          );
                        },
                      ),
                      OutlinedButton.icon(
                        icon: const Icon(Icons.add_task, size: 15, color: Color(0xFF006A6B)),
                        label: const Text('+ Criar Quiz', style: TextStyle(fontSize: 12, color: Color(0xFF006A6B), fontWeight: FontWeight.bold)),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Color(0xFF006A6B)),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        onPressed: () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Caso clínico/Quiz gerado e vinculado à disciplina!'),
                              duration: Duration(seconds: 2),
                              backgroundColor: Color(0xFF006A6B),
                            ),
                          );
                        },
                      ),
                    ],
                  )
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInputBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Color(0xFFE2EBEA))),
      ),
      child: SafeArea(
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _textController,
                decoration: InputDecoration(
                  hintText: 'Pergunte sobre conduta, fisiopatologia, doses...',
                  hintStyle: const TextStyle(fontSize: 13, color: Colors.black38),
                  filled: true,
                  fillColor: const Color(0xFFF3F7F6),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                ),
                onSubmitted: (_) => _handleSend(),
              ),
            ),
            const SizedBox(width: 8),
            CircleAvatar(
              radius: 22,
              backgroundColor: const Color(0xFF006A6B),
              child: IconButton(
                icon: const Icon(Icons.arrow_upward, color: Colors.white, size: 20),
                onPressed: _handleSend,
              ),
            )
          ],
        ),
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// TAB 1: FLASHCARDS VIEW
// -----------------------------------------------------------------------------
class FlashcardModel {
  final String subject;
  final String category;
  final String question;
  final String answer;
  final String evidenceSource;

  FlashcardModel({
    required this.subject,
    required this.category,
    required this.question,
    required this.answer,
    required this.evidenceSource,
  });
}

class FlashcardsView extends StatefulWidget {
  const FlashcardsView({super.key});

  @override
  State<FlashcardsView> createState() => _FlashcardsViewState();
}

class _FlashcardsViewState extends State<FlashcardsView> {
  int _currentIndex = 0;
  bool _isFlipped = false;
  String _selectedCycle = 'Todos';

  final List<FlashcardModel> _allFlashcards = [
    FlashcardModel(
      subject: 'Farmacologia Clínica',
      category: 'Ciclo Básico',
      question: 'Qual o mecanismo de ação dos Inibidores da ECA (ex: Enalapril) e o principal efeito adverso mediado por bradicinina?',
      answer: 'Inibem a enzima conversora de angiotensina I em II, reduzindo vasoconstrição e aldosterona. O acúmulo de bradicinina causa tosse seca crônica em 5-20% dos pacientes.',
      evidenceSource: 'Goodman & Gilman / Diretrizes Brasileiras de HAS 2020',
    ),
    FlashcardModel(
      subject: 'Semiologia / Propedêutica',
      category: 'Ciclo Clínico',
      question: 'O que define a Tríade de Beck no Tamponamento Cardíaco?',
      answer: '1. Hipofonese de bulhas cardíacas\n2. Turgência jugular patológica\n3. Hipotensão arterial (com pulso paradoxal associado).',
      evidenceSource: 'Semiologia Médica Porto 8ª Ed / UpToDate',
    ),
    FlashcardModel(
      subject: 'Ginecologia e Obstetrícia',
      category: 'Internato',
      question: 'Qual a conduta medicamentosa mandatória imediata para prevenção de convulsões na Pré-Eclâmpsia Grave?',
      answer: 'Sulfato de Magnésio (Regimes de Zuspan ou Pritchard). Manter monitorização de reflexo patelar, FR (>12 ipm) e diurese (>25ml/h) pelo risco de intoxicação.',
      evidenceSource: 'FEBRASGO 2023 / Protocolo Ministério da Saúde',
    ),
    FlashcardModel(
      subject: 'Pediatria',
      category: 'Internato',
      question: 'Quais os 3 critérios clínicos clássicos da Síndrome Nefrítica na infância (Pós-Estreptocócica)?',
      answer: '1. Hematúria (micro ou macroscópica com urina cor de coca-cola)\n2. Edema (periorbital/matutino)\n3. Hipertensão Arterial Sistêmica.',
      evidenceSource: 'SBP (Sociedade Brasileira de Pediatria) 2022',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final filteredCards = _selectedCycle == 'Todos'
        ? _allFlashcards
        : _allFlashcards.where((c) => c.category == _selectedCycle).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Flashcards & Repetição Espaçada', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Filtro por Ciclo
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: ['Todos', 'Ciclo Básico', 'Ciclo Clínico', 'Internato'].map((filter) {
                  final isSelected = _selectedCycle == filter;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8.0),
                    child: FilterChip(
                      selected: isSelected,
                      label: Text(filter),
                      selectedColor: const Color(0xFF006A6B),
                      labelStyle: TextStyle(
                        color: isSelected ? Colors.white : const Color(0xFF006A6B),
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                      backgroundColor: Colors.white,
                      checkmarkColor: Colors.white,
                      onSelected: (val) {
                        setState(() {
                          _selectedCycle = filter;
                          _currentIndex = 0;
                          _isFlipped = false;
                        });
                      },
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 16),
            if (filteredCards.isEmpty)
              const Center(child: Text('Nenhum flashcard disponível nesta categoria.'))
            else ...[
              // Progresso
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Cartão ${_currentIndex + 1} de ${filteredCards.length}',
                      style: const TextStyle(fontSize: 13, color: Color(0xFF4A6363), fontWeight: FontWeight.bold)),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE0F2F1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      filteredCards[_currentIndex].subject,
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF006A6B)),
                    ),
                  )
                ],
              ),
              const SizedBox(height: 14),
              // Cartão Interativo 3D Flip
              GestureDetector(
                onTap: () {
                  setState(() {
                    _isFlipped = !_isFlipped;
                  });
                },
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 350),
                  transitionBuilder: (Widget child, Animation<double> animation) {
                    final rotate = Tween(begin: pi, end: 0.0).animate(animation);
                    return AnimatedBuilder(
                      animation: rotate,
                      child: child,
                      builder: (context, widgetChild) {
                        final isUnder = (ValueKey(_isFlipped) != widgetChild?.key);
                        var tilt = ((animation.value - 0.5).abs() - 0.5) * 0.003;
                        tilt *= isUnder ? -1.0 : 1.0;
                        final value = isUnder ? min(rotate.value, pi / 2) : rotate.value;
                        return Transform(
                          transform: Matrix4.rotationY(value)..setEntry(3, 0, tilt),
                          alignment: Alignment.center,
                          child: widgetChild,
                        );
                      },
                    );
                  },
                  child: _isFlipped
                      ? _buildBackCard(filteredCards[_currentIndex])
                      : _buildFrontCard(filteredCards[_currentIndex]),
                ),
              ),
              const SizedBox(height: 20),
              // Botoes de Repeticao Espacada (Anki style)
              if (_isFlipped) ...[
                const Text(
                  'Como foi sua retenção?',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF4A6363)),
                ),
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _buildFeedbackButton('Difícil', Colors.red.shade700, '< 1 dia', filteredCards.length),
                    _buildFeedbackButton('Bom', Colors.orange.shade800, '3 dias', filteredCards.length),
                    _buildFeedbackButton('Fácil', Colors.teal.shade700, '7 dias', filteredCards.length),
                  ],
                ),
              ] else ...[
                ElevatedButton.icon(
                  icon: const Icon(Icons.flip, color: Colors.white),
                  label: const Text('Virar Cartão (Ver Resposta)', style: TextStyle(color: Colors.white)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF006A6B),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () {
                    setState(() {
                      _isFlipped = true;
                    });
                  },
                ),
              ]
            ]
          ],
        ),
      ),
    );
  }

  Widget _buildFrontCard(FlashcardModel card) {
    return Container(
      key: const ValueKey(false),
      height: 320,
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF006A6B).withOpacity(0.3), width: 1.5),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 10, offset: const Offset(0, 4))
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.help_outline, size: 40, color: Color(0xFF006A6B)),
          const SizedBox(height: 16),
          const Text('PERGUNTA CLÍNICA', style: TextStyle(fontSize: 12, letterSpacing: 1.2, fontWeight: FontWeight.bold, color: Color(0xFF4A6363))),
          const SizedBox(height: 14),
          Text(
            card.question,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFF1E2929), height: 1.4),
          ),
          const Spacer(),
          const Text('Toque para revelar a resposta e fonte', style: TextStyle(fontSize: 11, color: Colors.grey)),
        ],
      ),
    );
  }

  Widget _buildBackCard(FlashcardModel card) {
    return Container(
      key: const ValueKey(true),
      height: 320,
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: const Color(0xFFF0F7F7),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF006A6B), width: 2),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 10, offset: const Offset(0, 4))
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const [
              Text('RESPOSTA COMENTADA', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF006A6B))),
              Icon(Icons.check_circle_outline, color: Color(0xFF006A6B), size: 20),
            ],
          ),
          const Divider(height: 16),
          Expanded(
            child: SingleChildScrollView(
              child: Text(
                card.answer,
                style: const TextStyle(fontSize: 14.5, color: Color(0xFF1E2929), height: 1.4),
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(Icons.bookmark_added, size: 14, color: Color(0xFF006A6B)),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    'Fonte: ${card.evidenceSource}',
                    style: const TextStyle(fontSize: 11, color: Color(0xFF4A6363), fontStyle: FontStyle.italic),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          )
        ],
      ),
    );
  }

  Widget _buildFeedbackButton(String label, Color color, String interval, int total) {
    return InkWell(
      onTap: () {
        setState(() {
          _isFlipped = false;
          _currentIndex = (_currentIndex + 1) % total;
        });
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        decoration: BoxDecoration(
          color: color.withOpacity(0.12),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color, width: 1.2),
        ),
        child: Column(
          children: [
            Text(label, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 2),
            Text(interval, style: TextStyle(color: color, fontSize: 10)),
          ],
        ),
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// TAB 2: QUIZZES VIEW (CASOS CLÍNICOS)
// -----------------------------------------------------------------------------
class QuizModel {
  final String title;
  final String clinicalCase;
  final List<String> options;
  final int correctIndex;
  final String justification;
  final String specialty;

  QuizModel({
    required this.title,
    required this.clinicalCase,
    required this.options,
    required this.correctIndex,
    required this.justification,
    required this.specialty,
  });
}

class QuizzesView extends StatefulWidget {
  const QuizzesView({super.key});

  @override
  State<QuizzesView> createState() => _QuizzesViewState();
}

class _QuizzesViewState extends State<QuizzesView> {
  final List<QuizModel> _quizzes = [
    QuizModel(
      title: 'Caso 1: Dor Torácica Súbita na Sala de Emergência',
      specialty: 'Urgência e Emergência / Cardiologia',
      clinicalCase:
          'Homem, 58 anos, hipertenso e tabagista, dá entrada na UPA com dor precordial opressiva irradiada para mandíbula iniciada há 40 minutos. ECG revela supradesnivelamento do segmento ST de 2,5 mm em DII, DIII e aVF. PA: 135x85 mmHg, FC: 78 bpm. Qual a conduta inicial mais adequada?',
      options: [
        'A) Administrar Morfina, Oxigênio sob cateter a 5L/min mesmo sem hipoxemia, e solicitar TC de Tórax.',
        'B) Dupla antiagregação (AAS + Clopidogrel), anticoagulação plena, nitrato sublingual e encaminhar imediatamente para trombólise ou angioplastia primária (<120 min).',
        'C) Realizar Ecocardiograma antes de qualquer medicação para confirmar contratilidade segmentar.',
        'D) Administrar apenas Beta-bloqueador IV e aguardar resultado da curva de Troponina ultrassensível.',
      ],
      correctIndex: 1,
      justification:
          'Trata-se de IAM com Supra de ST (IAMCSST) de parede inferior. O tempo é músculo: dupla antiagregação plaquetária com AAS e inibidor P2Y12 associada à estratégia de reperfusão imediata (angioplastia ou trombolítico se tempo porta-balão > 120 min) é a conduta padrão com maior redução de mortalidade (Diretrizes SBC/ACC/AHA). Oxigênio de rotina não é indicado se SatO2 > 90%.',
    ),
    QuizModel(
      title: 'Caso 2: Paciente Jovem com Febre e Cefaleia',
      specialty: 'Infectologia / Neurologia',
      clinicalCase:
          'Mulher, 21 anos, estudante universitária, apresenta febre alta (39,2°C), cefaleia holocraniana intensa e rigidez de nuca com sinais de Brudzinski e Kernig positivos. Foram colhidas hemoculturas e indicada punção lombar. Qual é a conduta terapêutica antimicrobiana empírica imediata?',
      options: [
        'A) Ceftriaxona 2g IV 12/12h + Ampicilina + Dexametasona antes/junto com o antibiótico.',
        'B) Amoxicilina via oral por 10 dias ambulatorialmente.',
        'C) Ciprofloxacino via oral dose única.',
        'D) Aguardar resultado da cultura do líquor (48h) para não induzir resistência.',
      ],
      correctIndex: 0,
      justification:
          'Suspeita de Meningite Bacteriana Aguda comunitária. O início imediato de Ceftriaxona IV de alta penetração em SNC é mandatório. Dexametasona administrada antes ou junto com a primeira dose reduz sequelas auditivas e mortalidade em infecções pneumocócicas. Jamais se deve atrasar o antibiótico pela punção ou exames.',
    ),
  ];

  final Map<int, int?> _selectedAnswers = {};
  final Map<int, bool> _submitted = {};

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Quizzes & Casos Clínicos Comentados', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _quizzes.length,
        itemBuilder: (context, index) {
          final quiz = _quizzes[index];
          final selectedOption = _selectedAnswers[index];
          final isSubmitted = _submitted[index] ?? false;

          return Card(
            margin: const EdgeInsets.only(bottom: 20),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFB4ECEE),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          quiz.specialty,
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF004D4E)),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(quiz.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF006A6B))),
                  const SizedBox(height: 8),
                  Text(quiz.clinicalCase, style: const TextStyle(fontSize: 13.5, height: 1.4, color: Color(0xFF2C3E3E))),
                  const Divider(height: 24),
                  ...List.generate(quiz.options.length, (optIndex) {
                    final isCorrect = optIndex == quiz.correctIndex;
                    final isSelected = selectedOption == optIndex;

                    Color? tileColor;
                    if (isSubmitted) {
                      if (isCorrect) {
                        tileColor = Colors.green.shade50;
                      } else if (isSelected && !isCorrect) {
                        tileColor = Colors.red.shade50;
                      }
                    }

                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      decoration: BoxDecoration(
                        color: tileColor ?? (isSelected ? const Color(0xFFE0F2F1) : Colors.grey.shade50),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: isSubmitted
                              ? (isCorrect ? Colors.green : (isSelected ? Colors.red : Colors.grey.shade300))
                              : (isSelected ? const Color(0xFF006A6B) : Colors.grey.shade300),
                          width: isSelected || (isSubmitted && isCorrect) ? 1.5 : 1,
                        ),
                      ),
                      child: RadioListTile<int>(
                        value: optIndex,
                        groupValue: selectedOption,
                        dense: true,
                        activeColor: const Color(0xFF006A6B),
                        title: Text(
                          quiz.options[optIndex],
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            color: isSubmitted && isCorrect
                                ? Colors.green.shade900
                                : (isSubmitted && isSelected ? Colors.red.shade900 : const Color(0xFF1E2929)),
                          ),
                        ),
                        onChanged: isSubmitted
                            ? null
                            : (val) {
                                setState(() {
                                  _selectedAnswers[index] = val;
                                });
                              },
                      ),
                    );
                  }),
                  const SizedBox(height: 12),
                  if (!isSubmitted)
                    Align(
                      alignment: Alignment.centerRight,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF006A6B),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        onPressed: selectedOption == null
                            ? null
                            : () {
                                setState(() {
                                  _submitted[index] = true;
                                });
                              },
                        child: const Text('Confirmar Diagnóstico'),
                      ),
                    ),
                  if (isSubmitted) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF3F8F8),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFB4ECEE)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                selectedOption == quiz.correctIndex ? Icons.check_circle : Icons.cancel,
                                color: selectedOption == quiz.correctIndex ? Colors.green : Colors.red,
                                size: 18,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                selectedOption == quiz.correctIndex ? 'Resposta Correta!' : 'Resposta Incorreta',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: selectedOption == quiz.correctIndex ? Colors.green.shade800 : Colors.red.shade800,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          const Text('Justificativa Diagnóstica & Evidência:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF006A6B))),
                          const SizedBox(height: 4),
                          Text(quiz.justification, style: const TextStyle(fontSize: 12.5, color: Color(0xFF2C3E3E), height: 1.35)),
                        ],
                      ),
                    )
                  ]
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// TAB 3: MEDICAL CURRICULUM (DCNs) VIEW
// -----------------------------------------------------------------------------
class CurriculumSubject {
  final String name;
  final double progress;
  final int flashcardsMastered;
  final int totalFlashcards;

  CurriculumSubject({
    required this.name,
    required this.progress,
    required this.flashcardsMastered,
    required this.totalFlashcards,
  });
}

class CurriculumView extends StatelessWidget {
  const CurriculumView({super.key});

  @override
  Widget build(BuildContext context) {
    final basicCycle = [
      CurriculumSubject(name: 'Anatomia Humana', progress: 0.85, flashcardsMastered: 120, totalFlashcards: 140),
      CurriculumSubject(name: 'Fisiologia Médica', progress: 0.72, flashcardsMastered: 95, totalFlashcards: 130),
      CurriculumSubject(name: 'Patologia Geral e Sistêmica', progress: 0.60, flashcardsMastered: 60, totalFlashcards: 100),
      CurriculumSubject(name: 'Farmacologia Básica', progress: 0.78, flashcardsMastered: 78, totalFlashcards: 100),
    ];

    final clinicalCycle = [
      CurriculumSubject(name: 'Semiologia e Propedêutica', progress: 0.90, flashcardsMastered: 135, totalFlashcards: 150),
      CurriculumSubject(name: 'Clínica Médica', progress: 0.65, flashcardsMastered: 130, totalFlashcards: 200),
      CurriculumSubject(name: 'Clínica Cirúrgica', progress: 0.45, flashcardsMastered: 45, totalFlashcards: 100),
      CurriculumSubject(name: 'Diagnóstico por Imagem', progress: 0.50, flashcardsMastered: 40, totalFlashcards: 80),
    ];

    final internshipCycle = [
      CurriculumSubject(name: 'Pediatria e Puericultura', progress: 0.80, flashcardsMastered: 88, totalFlashcards: 110),
      CurriculumSubject(name: 'Ginecologia e Obstetrícia (GO)', progress: 0.70, flashcardsMastered: 84, totalFlashcards: 120),
      CurriculumSubject(name: 'Saúde Coletiva / MFC', progress: 0.55, flashcardsMastered: 44, totalFlashcards: 80),
      CurriculumSubject(name: 'Urgência, Emergência e UTI', progress: 0.68, flashcardsMastered: 68, totalFlashcards: 100),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Grade Curricular Médica (DCNs)', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Banner de Progresso Geral do Curso
            _buildOverallProgressCard(),
            const SizedBox(height: 20),
            _buildPhaseSection(
              title: '1. Ciclo Básico (1º ao 4º Período)',
              subtitle: 'Bases morfofuncionais, celulares e fisiopatológicas',
              icon: Icons.biotech,
              subjects: basicCycle,
            ),
            const SizedBox(height: 20),
            _buildPhaseSection(
              title: '2. Ciclo Clínico (5º ao 8º Período)',
              subtitle: 'Semiogênese, raciocínio diagnóstico e terapêutica',
              icon: Icons.local_hospital,
              subjects: clinicalCycle,
            ),
            const SizedBox(height: 20),
            _buildPhaseSection(
              title: '3. Internato Médico (9º ao 12º Período)',
              subtitle: 'Prática em serviço, urgências e grandes áreas de rodízio',
              icon: Icons.emergency,
              subjects: internshipCycle,
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildOverallProgressCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF006A6B), Color(0xFF004D4E)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(color: const Color(0xFF006A6B).withOpacity(0.3), blurRadius: 10, offset: const Offset(0, 4))
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const [
              Text('Acúmulo de Conhecimento Global', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
              Icon(Icons.verified, color: Color(0xFF82F5F6), size: 22),
            ],
          ),
          const SizedBox(height: 8),
          const Text('Baseado na retenção de diretrizes, flashcards e resolução de casos', style: TextStyle(color: Colors.white70, fontSize: 12)),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: const LinearProgressIndicator(
                    value: 0.69,
                    minHeight: 10,
                    backgroundColor: Colors.white24,
                    valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF82F5F6)),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              const Text('69%', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
            ],
          )
        ],
      ),
    );
  }

  Widget _buildPhaseSection({
    required String title,
    required String subtitle,
    required IconData icon,
    required List<CurriculumSubject> subjects,
  }) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: const Color(0xFFE0F2F1),
                  child: Icon(icon, color: const Color(0xFF006A6B), size: 20),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF006A6B))),
                      Text(subtitle, style: const TextStyle(fontSize: 11, color: Color(0xFF4A6363))),
                    ],
                  ),
                )
              ],
            ),
            const Divider(height: 20),
            ...subjects.map((sub) => Padding(
                  padding: const EdgeInsets.only(bottom: 12.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(sub.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF1E2929))),
                          Text('${sub.flashcardsMastered}/${sub.totalFlashcards} cards (${(sub.progress * 100).toInt()}%)',
                              style: const TextStyle(fontSize: 11, color: Color(0xFF4A6363), fontWeight: FontWeight.bold)),
                        ],
                      ),
                      const SizedBox(height: 6),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: sub.progress,
                          minHeight: 6,
                          backgroundColor: const Color(0xFFE2EBEA),
                          valueColor: AlwaysStoppedAnimation<Color>(
                            sub.progress >= 0.75
                                ? const Color(0xFF006A6B)
                                : (sub.progress >= 0.5 ? const Color(0xFF26A69A) : Colors.orange.shade600),
                          ),
                        ),
                      )
                    ],
                  ),
                )),
          ],
        ),
      ),
    );
  }
}