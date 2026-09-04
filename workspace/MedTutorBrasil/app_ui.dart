import 'package:flutter/material.dart';
import 'services.dart';

void main() {
  runApp(const MedTutorBrasilApp());
}

class MedTutorBrasilApp extends StatefulWidget {
  const MedTutorBrasilApp({super.key});

  @override
  State<MedTutorBrasilApp> createState() => _MedTutorBrasilAppState();
}

class _MedTutorBrasilAppState extends State<MedTutorBrasilApp> {
  ThemeMode _themeMode = ThemeMode.dark;

  void _toggleTheme() {
    setState(() {
      _themeMode = _themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    });
  }

  @override
  Widget build(BuildContext context) {
    const neonGreen = Color(0xFF00FF66);
    const neonDarkGreen = Color(0xFF00A844);

    return MaterialApp(
      title: 'MedTutor Brasil',
      debugShowCheckedModeBanner: false,
      themeMode: _themeMode,
      // Tema Dia (Branco Puro com Acentos Verde Neon Escuro)
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        scaffoldBackgroundColor: const Color(0xFFF6FAF8),
        colorScheme: ColorScheme.light(
          primary: neonDarkGreen,
          onPrimary: Colors.white,
          surface: Colors.white,
          onSurface: const Color(0xFF0D1410),
          outline: const Color(0xFFDDE6E2),
        ),
      ),
      // Tema Noite (Preto Profundo com Acentos Verde Neon Vibrante)
      darkTheme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF080A09),
        colorScheme: ColorScheme.dark(
          primary: neonGreen,
          onPrimary: Colors.black,
          surface: const Color(0xFF101412),
          onSurface: const Color(0xFFF2F5F3),
          outline: const Color(0xFF202A24),
        ),
      ),
      home: MainAdaptiveScaffold(
        themeMode: _themeMode,
        onToggleTheme: _toggleTheme,
      ),
    );
  }
}

class MainAdaptiveScaffold extends StatefulWidget {
  final ThemeMode themeMode;
  final VoidCallback onToggleTheme;

  const MainAdaptiveScaffold({
    super.key,
    required this.themeMode,
    required this.onToggleTheme,
  });

  @override
  State<MainAdaptiveScaffold> createState() => _MainAdaptiveScaffoldState();
}

class _MainAdaptiveScaffoldState extends State<MainAdaptiveScaffold> {
  int _selectedIndex = 0;

  // Banco Unificado de Estudo com suporte a detecção de redundância e estrelas
  final List<SharedStudyItem> _sharedItems = [];

  // Grade Curricular (Começa vazia até upload da ementa)
  final List<UniversitySubject> _curriculumSubjects = [];

  // Roteiro Adaptativo de Estudos ("Waze da Medicina")
  late AdaptiveStudyRoute _adaptiveRoute;

  @override
  void initState() {
    super.initState();
    _initSampleRoute();
  }

  void _initSampleRoute() {
    final now = DateTime.now();
    _adaptiveRoute = AdaptiveStudyRoute(tasks: [
      AdaptiveStudyTask(
        id: 't-1',
        subjectName: 'Cardiologia',
        topic: 'Insuficiência Cardíaca com Fração de Ejeção Reduzida',
        targetMinutes: 30,
        scheduledDate: now.subtract(const Duration(days: 1)),
        isDelayed: true,
      ),
      AdaptiveStudyTask(
        id: 't-2',
        subjectName: 'Farmacologia',
        topic: 'Inibidores de SGLT2 e Antagonistas dos Receptores de Mineralocorticoides',
        targetMinutes: 25,
        scheduledDate: now,
      ),
      AdaptiveStudyTask(
        id: 't-3',
        subjectName: 'Pneumologia',
        topic: 'Exacerbação da Asma Grave e Manejo na Emergência',
        targetMinutes: 35,
        scheduledDate: now.add(const Duration(days: 1)),
      ),
    ]);
  }

  void _addMaterialItem(String question, String answer, String subject) {
    // Detecção Matemática de Redundância sem IA (Custo R$ 0,00)
    final redundancyCheck = TextSimilarityEngine.checkRedundancy(question, _sharedItems);
    final isRedundant = redundancyCheck['isRedundant'] as bool;
    final score = redundancyCheck['score'] as double;
    final matched = redundancyCheck['matchedItem'] as SharedStudyItem?;

    setState(() {
      _sharedItems.add(
        SharedStudyItem(
          id: 'item-${DateTime.now().millisecondsSinceEpoch}-${_sharedItems.length}',
          subject: subject,
          question: question,
          referenceAnswer: answer,
          quizOptions: [
            'Opção A: Conduta de primeira escolha fundamentada',
            'Opção B: Conduta diagnóstica secundária',
            'Opção C: Conduta contraindicada neste estágio',
            'Opção D: Exame complementar com baixa acurácia'
          ],
          correctOptionIndex: 0,
          isRedundant: isRedundant,
          redundancyScore: score,
          similarToId: matched?.id,
          isStarred: false,
        ),
      );
    });

    if (isRedundant) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: Colors.amber[900],
          content: Text(
            'Aviso: ${redundancyCheck['percentage']}% de similaridade com item existente! Marque com Estrela ou Exclua para evitar repetição.',
          ),
        ),
      );
    }
  }

  void _deleteItem(String id) {
    setState(() {
      _sharedItems.removeWhere((item) => item.id == id);
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Item redundante excluído da base com sucesso.')),
    );
  }

  void _toggleStarItem(String id) {
    setState(() {
      final index = _sharedItems.indexWhere((item) => item.id == id);
      if (index != -1) {
        final current = _sharedItems[index];
        _sharedItems[index] = current.copyWith(isStarred: !current.isStarred);
      }
    });
  }

  void _loadSyllabus(List<String> subjects) {
    setState(() {
      _curriculumSubjects.clear();
      for (var s in subjects) {
        _curriculumSubjects.add(UniversitySubject(
          id: 'subj-${DateTime.now().millisecondsSinceEpoch}-${_curriculumSubjects.length}',
          name: s,
          period: 'Ciclo Clínico',
          masteryPercentage: 45.0,
          studiedItemsCount: 12,
        ));
      }
    });
  }

  void _showHelp(BuildContext context, String title, String explanation) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: [
            const Icon(Icons.help_outline, color: Color(0xFF00FF66)),
            const SizedBox(width: 8),
            Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          ],
        ),
        content: Text(
          explanation,
          style: const TextStyle(fontSize: 14, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Entendi', style: TextStyle(color: Color(0xFF00FF66))),
          ),
        ],
      ),
    );
  }

  void _openDriveSyncModal(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        final simulatedFiles = [
          {'name': 'Apresentação do Plano de Aula - Dermatologia - 2026.2.pdf', 'size': '35 KB', 'eligible': true, 'needsComp': false, 'isBook': false, 'reason': '✓ Elegível direto (< 100 MB): Ementa e cronograma oficial da disciplina'},
          {'name': 'Aula 2 - Sistema Tegumentar.pdf', 'size': '2.3 MB', 'eligible': true, 'needsComp': false, 'isBook': false, 'reason': '✓ Elegível direto (< 100 MB): Camadas da pele, histologia e queratinócitos'},
          {'name': 'Lesoes-Elementares-em-Dermatologia - Aula 1.pdf', 'size': '3.4 MB', 'eligible': true, 'needsComp': false, 'isBook': false, 'reason': '✓ Elegível direto (< 100 MB): Semiologia cutânea (máculas, pápulas, placas, pústulas)'},
          {'name': 'Dermatite Seborreica, Atópica e Contato - Aula 3.pdf', 'size': '279 KB', 'eligible': true, 'needsComp': false, 'isBook': false, 'reason': '✓ Elegível direto (< 100 MB): Diferencial clínico de eczemas e dermatites'},
          {'name': 'Psoríase, liquen plano.pdf', 'size': '37.6 MB', 'eligible': true, 'needsComp': false, 'isBook': false, 'reason': '✓ Elegível direto (< 100 MB): Atlas clínico (Sinal de Auspitz, Koebner e Wickham)'},
          {'name': 'DOC-20260814-WA0076.pdf', 'size': '2.6 MB', 'eligible': true, 'needsComp': false, 'isBook': false, 'reason': '✓ Elegível direto (< 100 MB): Casos clínicos e roteiro ambulatorial'},
          {'name': 'DOC-20260814-WA0108.pdf', 'size': '1.6 MB', 'eligible': true, 'needsComp': false, 'isBook': false, 'reason': '✓ Elegível direto (< 100 MB): Roteiro de revisão e esquemas diagnósticos'},
          {'name': 'Dermatologia - Azulay (8ª Edição)_260814_151238.pdf', 'size': '50.3 MB', 'eligible': false, 'needsComp': false, 'isBook': true, 'reason': '📖 Livro-texto extenso (50.3 MB): Omitido por padrão para poupar custos e focar nas aulas da prova'},
        ];

        return Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.cloud_sync_outlined, color: Color(0xFF00FF66), size: 28),
                      SizedBox(width: 10),
                      Text('Atualizar por Drive', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  IconButton(
                    icon: const Icon(Icons.help_outline, size: 20),
                    onPressed: () => _showHelp(
                      context,
                      'Atualizar por Drive & Compactador',
                      'Materiais de 100MB a 300MB são compactados localmente no seu dispositivo (sem IA). Livros enciclopédicos extensos são ignorados para focar no cronograma de aulas e economizar processamento.',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              const Text(
                'Insira o link da pasta compartilhada do Google Drive da sua turma ou faculdade para vasculhar os materiais:',
                style: TextStyle(fontSize: 13, color: Colors.grey),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Theme.of(context).colorScheme.outline),
                      ),
                      child: const TextField(
                        controller: null,
                        decoration: InputDecoration(
                          hintText: 'https://drive.google.com/drive/u/0/folders/1tY7WG0g5QKGJRgqEWxrp43NhKEbSPenZ',
                          hintStyle: TextStyle(fontSize: 12, color: Colors.grey),
                          border: InputBorder.none,
                          icon: Icon(Icons.link, size: 18),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF00FF66),
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                    ),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Drive conectado com sucesso! 8 arquivos reais encontrados na pasta DISCIPLINA: Integração de sistemas humanos 2.')),
                      );
                    },
                    child: const Text('Vasculhar', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFF00FF66).withOpacity(0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFF00FF66).withOpacity(0.2)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.folder_open_outlined, color: Color(0xFF00FF66), size: 18),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'DISCIPLINA: Integração de sistemas humanos 2 (Dermatologia)',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF00FF66)),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 260),
                child: ListView(
                  shrinkWrap: true,
                  children: simulatedFiles.map((file) {
                    final isEligible = file['eligible'] as bool;
                    final isBook = file['isBook'] as bool;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: isEligible
                              ? const Color(0xFF00FF66).withOpacity(0.4)
                              : (isBook ? Colors.indigo.withOpacity(0.4) : Colors.red.withOpacity(0.4)),
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            isEligible
                                ? Icons.check_circle_outline
                                : (isBook ? Icons.menu_book_outlined : Icons.block_outlined),
                            color: isEligible
                                ? const Color(0xFF00FF66)
                                : (isBook ? Colors.indigoAccent : Colors.red),
                            size: 22,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('${file['name']} (${file['size']})', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                Text(
                                  file['reason'] as String,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: isEligible
                                        ? Colors.green[400]
                                        : (isBook ? Colors.indigo[200] : Colors.red[300]),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF00FF66),
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  icon: const Icon(Icons.sync_outlined),
                  label: const Text('Sincronizar 7 Aulas de Dermatologia (Livro Extenso Filtrado)', style: TextStyle(fontWeight: FontWeight.bold)),
                  onPressed: () {
                    Navigator.pop(ctx);
                    _addMaterialItem(
                      'Semiologia Dermatológica: Pápula, Placa e Nódulo',
                      'Pápula é elevação superficial < 1 cm; Placa é elevação plana em platô > 1 cm; Nódulo acomete derme profunda/hipoderme sendo mais palpável que visível.',
                      'Dermatologia (Sistemas Humanos 2)',
                    );
                    _addMaterialItem(
                      'Sinais Clínicos da Psoríase e Líquen Plano',
                      'Na Psoríase: Sinal da vela, Sinal de Auspitz (orvalho sangrento) e Fenômeno de Koebner. No Líquen Plano: pápulas violáceas poligonais com Estrias de Wickham.',
                      'Dermatologia (Sistemas Humanos 2)',
                    );
                    _addMaterialItem(
                      'Diferencial de Eczemas: Atópica vs Seborreica',
                      'No lactente acomete face malar poupando perioral e áreas extensoras; no adulto predomina em dobras flexurais com liquenificação.',
                      'Dermatologia (Sistemas Humanos 2)',
                    );
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Drive sincronizado! 7 aulas de Dermatologia importadas para Flashcards e SCE. Livro extenso Azulay mantido de fora para poupar IA.')),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDesktop = MediaQuery.of(context).size.width > 768;

    final screens = [
      ChatScreen(
        onGenerateItem: _addMaterialItem,
        onShowHelp: () => _showHelp(
          context,
          'Chat Científico',
          'Tire dúvidas clínicas e de farmacologia com fundamentação socrática em artigos médicos de alto impacto.',
        ),
      ),
      FlashcardsScreen(
        items: _sharedItems,
        onAddMaterial: _addMaterialItem,
        onDeleteItem: _deleteItem,
        onToggleStar: _toggleStarItem,
        onShowHelp: () => _showHelp(
          context,
          'Flashcards com Resposta Escrita',
          'Treine raciocínio clínico escrevendo respostas completas corrigidas por IA sem custo, ou use repetição espaçada tradicional.',
        ),
      ),
      QuizzesScreen(
        items: _sharedItems,
        onAddMaterial: _addMaterialItem,
        onDeleteItem: _deleteItem,
        onToggleStar: _toggleStarItem,
        onShowHelp: () => _showHelp(
          context,
          'Quizzes & Casos Clínicos',
          'Responda desafios de múltipla escolha sincronizados com seu material e receba justificativas imediatas.',
        ),
      ),
      CurriculumScreen(
        subjects: _curriculumSubjects,
        onLoadSyllabus: _loadSyllabus,
        onShowHelp: () => _showHelp(
          context,
          'Matérias Curriculares',
          'Organize suas disciplinas a partir do upload da ementa oficial da faculdade de medicina.',
        ),
      ),
      SceEvolutionScreen(
        subjects: _curriculumSubjects,
        route: _adaptiveRoute,
        onRecalculateRoute: () {
          setState(() {
            _adaptiveRoute.recalculateRoute();
          });
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Waze da Medicina: Rota recalculada! Tarefas redistribuídas nos próximos dias com sucesso.'),
            ),
          );
        },
        onShowHelp: () => _showHelp(
          context,
          'SCE & Waze de Estudos',
          'Acompanhe gráficos de evolução de aprendizado por disciplina e use o recálculo automático de rota caso se atrase.',
        ),
      ),
    ];

    if (isDesktop) {
      // Layout Desktop: Web e Windows com NavigationRail lateral
      return Scaffold(
        appBar: AppBar(
          title: const Text('MedTutor Brasil', style: TextStyle(fontWeight: FontWeight.bold)),
          actions: [
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF00FF66),
                side: const BorderSide(color: Color(0xFF00FF66)),
              ),
              icon: const Icon(Icons.cloud_sync_outlined, size: 18),
              label: const Text('Atualizar por Drive'),
              onPressed: () => _openDriveSyncModal(context),
            ),
            const SizedBox(width: 8),
            IconButton(
              icon: const Icon(Icons.help_outline),
              tooltip: 'Ajuda desta tela',
              onPressed: () => _showHelp(
                context,
                'MedTutor Brasil - Plataforma Integrada',
                'Ambiente unificado de medicina com Chat Clínico, Flashcards, Quizzes, Ementa Universitária e SCE Adaptativo.',
              ),
            ),
            IconButton(
              icon: Icon(widget.themeMode == ThemeMode.dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
              onPressed: widget.onToggleTheme,
            ),
            const SizedBox(width: 16),
          ],
        ),
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: _selectedIndex,
              onDestinationSelected: (idx) => setState(() => _selectedIndex = idx),
              labelType: NavigationRailLabelType.all,
              leading: const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Icon(Icons.local_hospital_outlined, size: 32, color: Color(0xFF00FF66)),
              ),
              destinations: const [
                NavigationRailDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: Text('Chat')),
                NavigationRailDestination(icon: Icon(Icons.style_outlined), selectedIcon: Icon(Icons.style), label: Text('Cards')),
                NavigationRailDestination(icon: Icon(Icons.quiz_outlined), selectedIcon: Icon(Icons.quiz), label: Text('Quizzes')),
                NavigationRailDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: Text('Matérias')),
                NavigationRailDestination(icon: Icon(Icons.insights_outlined), selectedIcon: Icon(Icons.insights), label: Text('SCE Roteiro')),
              ],
            ),
            const VerticalDivider(width: 1),
            Expanded(child: screens[_selectedIndex]),
          ],
        ),
      );
    }

    // Layout Mobile: iOS e Android com NavigationBar inferior e Topbar
    return Scaffold(
      appBar: AppBar(
        title: const Text('MedTutor Brasil', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
        actions: [
          IconButton(
            icon: const Icon(Icons.cloud_sync_outlined, color: Color(0xFF00FF66)),
            tooltip: 'Atualizar por Drive',
            onPressed: () => _openDriveSyncModal(context),
          ),
          IconButton(
            icon: const Icon(Icons.help_outline),
            tooltip: 'Ajuda',
            onPressed: () => _showHelp(
              context,
              'MedTutor Brasil',
              'Toque no ícone de interrogação em qualquer seção para entender sua utilidade e metodologia médica.',
            ),
          ),
          IconButton(
            icon: Icon(widget.themeMode == ThemeMode.dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
            onPressed: widget.onToggleTheme,
          ),
        ],
      ),
      body: screens[_selectedIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (idx) => setState(() => _selectedIndex = idx),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Chat'),
          NavigationDestination(icon: Icon(Icons.style_outlined), selectedIcon: Icon(Icons.style), label: 'Cards'),
          NavigationDestination(icon: Icon(Icons.quiz_outlined), selectedIcon: Icon(Icons.quiz), label: 'Quizzes'),
          NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: 'Matérias'),
          NavigationDestination(icon: Icon(Icons.insights_outlined), selectedIcon: Icon(Icons.insights), label: 'SCE'),
        ],
      ),
    );
  }
}

// 1. TELA DE CHAT CIENTÍFICO
class ChatScreen extends StatefulWidget {
  final Function(String, String, String) onGenerateItem;
  final VoidCallback onShowHelp;
  const ChatScreen({super.key, required this.onGenerateItem, required this.onShowHelp});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final List<Map<String, dynamic>> _messages = [];
  final TextEditingController _controller = TextEditingController();

  final List<DriveFileItem> _driveFiles = [
    DriveFileItem(
      id: '1t_01',
      name: 'Aula 2 - Sistema Tegumentar.pdf',
      sizeMB: 2.3,
      mimeType: 'application/pdf',
      isEligible: true,
    ),
    DriveFileItem(
      id: '1t_02',
      name: 'Lesoes-Elementares-em-Dermatologia - Aula 1 - 2026.2(1).pdf',
      sizeMB: 3.4,
      mimeType: 'application/pdf',
      isEligible: true,
    ),
    DriveFileItem(
      id: '1t_03',
      name: 'Psoríase, liquen plano.pdf',
      sizeMB: 37.6,
      mimeType: 'application/pdf',
      isEligible: true,
    ),
    DriveFileItem(
      id: '1t_04',
      name: 'Dermatite Seborreica, Dermatite Atópica...pdf',
      sizeMB: 0.3,
      mimeType: 'application/pdf',
      isEligible: true,
    ),
    DriveFileItem(
      id: '1t_08',
      name: 'Dermatologia - Azulay (8ª Edição).pdf',
      sizeMB: 50.3,
      mimeType: 'application/pdf',
      isEligible: false,
      isExtensiveBook: true,
      rejectionReason: 'Livro extenso omitido por padrão',
    ),
  ];

  final Set<String> _selectedDriveFileIds = {'1t_01', '1t_02', '1t_03'};
  bool _showDriveSelector = false;

  void _handleUploadMaterial() {
    widget.onGenerateItem(
      'Mecanismo de ação dos Inibidores da SGLT2 na IC',
      'Promovem glicosúria e natriurese, reduzindo pré e pós-carga e atuando na proteção cardiovascular e renal.',
      'Farmacologia',
    );
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Material convertido em Flashcards e Quizzes!')),
    );
  }

  void _produceReadingMaterial() {
    final selectedFiles = _driveFiles.where((f) => _selectedDriveFileIds.contains(f.id)).toList();
    final readingDoc = ReadingMaterialService.generateFromDriveFiles(selectedFiles);

    setState(() {
      _messages.add({
        'role': 'user',
        'text': '📖 Solicitação: Produzir Material de Estudo para Leitura médica com base em ${selectedFiles.length} aulas selecionadas do Drive.'
      });
      _messages.add({
        'role': 'reading_doc',
        'doc': readingDoc,
      });
      _showDriveSelector = false;
    });

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('📖 Material de Estudo para Leitura gerado com sucesso!')),
    );
  }

  void _sendMessage() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    final selectedCount = _selectedDriveFileIds.length;
    final lower = text.toLowerCase();
    final isReadingRequest = lower.contains('leitura') || lower.contains('apostila') || lower.contains('ler') || lower.contains('resumo');

    if (isReadingRequest) {
      _controller.clear();
      _produceReadingMaterial();
      return;
    }

    setState(() {
      _messages.add({
        'role': 'user',
        'text': selectedCount > 0 ? '$text\n\n📎 (Baseado em $selectedCount materiais selecionados do Drive)' : text,
      });
      _messages.add({
        'role': 'assistant',
        'text': selectedCount > 0 
            ? 'Fundamentado nos slides das aulas sincronizadas do Google Drive da disciplina:\n\nA análise semiológica da lesão primária orienta o diagnóstico diferencial e a conduta. Deseja produzir a apostila completa de leitura médica?'
            : 'Baseado nas diretrizes clínicas vigentes: A conduta fundamenta-se na otimização hemodinâmica e estratificação de risco precoce.'
      });
      _controller.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final selectedFiles = _driveFiles.where((f) => _selectedDriveFileIds.contains(f.id)).toList();

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          color: theme.colorScheme.surface,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Text('Tutor Clínico Socrático', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  SizedBox(width: 8),
                  Text('• Materiais do Drive', style: TextStyle(fontSize: 12, color: Color(0xFF00FF66))),
                ],
              ),
              IconButton(icon: const Icon(Icons.help_outline, size: 18), onPressed: widget.onShowHelp),
            ],
          ),
        ),
        const Divider(height: 1),

        // GAVETA DE MATERIAIS DO DRIVE
        if (_showDriveSelector)
          Container(
            padding: const EdgeInsets.all(12),
            color: theme.colorScheme.surface,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Materiais do Google Drive (Turma):', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF00FF66))),
                    Row(
                      children: [
                        TextButton(
                          onPressed: () {
                            setState(() {
                              _selectedDriveFileIds.clear();
                              for (var f in _driveFiles) {
                                if (!f.isExtensiveBook) _selectedDriveFileIds.add(f.id);
                              }
                            });
                          },
                          child: const Text('Marcar Aulas', style: TextStyle(fontSize: 11)),
                        ),
                        TextButton(
                          onPressed: () => setState(() => _selectedDriveFileIds.clear()),
                          child: const Text('Limpar', style: TextStyle(fontSize: 11)),
                        ),
                        ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF00FF66),
                            foregroundColor: Colors.black,
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          ),
                          onPressed: _produceReadingMaterial,
                          child: const Text('📖 Produzir Leitura', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: _driveFiles.map((f) {
                    final isChecked = _selectedDriveFileIds.contains(f.id);
                    return FilterChip(
                      selected: isChecked,
                      label: Text(
                        '${f.name} (${f.sizeMB} MB)',
                        style: TextStyle(
                          fontSize: 11,
                          color: f.isExtensiveBook ? Colors.orange : (isChecked ? Colors.black : theme.colorScheme.onSurface),
                        ),
                      ),
                      selectedColor: const Color(0xFF00FF66),
                      onSelected: (val) {
                        setState(() {
                          if (val) {
                            _selectedDriveFileIds.add(f.id);
                          } else {
                            _selectedDriveFileIds.remove(f.id);
                          }
                        });
                      },
                    );
                  }).toList(),
                ),
                const Divider(),
              ],
            ),
          ),

        // BARRA DE MATERIAIS ANEXADOS
        if (selectedFiles.isNotEmpty && !_showDriveSelector)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            color: const Color(0xFF00FF66).withOpacity(0.08),
            child: Row(
              children: [
                const Icon(Icons.attachment, size: 16, color: Color(0xFF00FF66)),
                const SizedBox(width: 6),
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: selectedFiles.map((f) => Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: Chip(
                          label: Text(f.name, style: const TextStyle(fontSize: 11)),
                          deleteIcon: const Icon(Icons.close, size: 14),
                          onDeleted: () => setState(() => _selectedDriveFileIds.remove(f.id)),
                        ),
                      )).toList(),
                    ),
                  ),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF00FF66),
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  ),
                  onPressed: _produceReadingMaterial,
                  child: const Text('📖 Gerar Leitura', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),

        Expanded(
          child: _messages.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.chat_bubble_outline, size: 48, color: Color(0xFF00FF66)),
                      const SizedBox(height: 16),
                      const Text('Tutor Clínico com Materiais do Drive', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      const Text('Envie dúvidas médicas ou selecione aulas do Drive para gerar leitura.', style: TextStyle(color: Colors.grey)),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          OutlinedButton.icon(
                            icon: const Icon(Icons.folder_outlined),
                            label: Text('📁 Drive (${_selectedDriveFileIds.length} aulas)'),
                            onPressed: () => setState(() => _showDriveSelector = !_showDriveSelector),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF00FF66),
                              foregroundColor: Colors.black,
                            ),
                            icon: const Icon(Icons.menu_book_outlined),
                            label: const Text('📖 Produzir Leitura'),
                            onPressed: _produceReadingMaterial,
                          ),
                        ],
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _messages.length,
                  itemBuilder: (ctx, i) {
                    final msg = _messages[i];
                    final isReading = msg['role'] == 'reading_doc';
                    final isUser = msg['role'] == 'user';

                    if (isReading) {
                      final doc = msg['doc'] as ReadingStudyMaterial;
                      return Container(
                        margin: const EdgeInsets.only(bottom: 16),
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surface,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: const Color(0xFF00FF66), width: 1.5),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Chip(
                                  label: Text('📚 MATERIAL DE ESTUDO PARA LEITURA', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                                  backgroundColor: Color(0xFF00FF66),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.copy_outlined, size: 18),
                                  tooltip: 'Copiar Apostila',
                                  onPressed: () {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(content: Text('Apostila copiada para a área de transferência!')),
                                    );
                                  },
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(doc.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                            Text(doc.module, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                            const SizedBox(height: 12),
                            const Text('1. Propedêutica & Tabela Semiológica:', style: TextStyle(fontWeight: FontWeight.bold)),
                            const SizedBox(height: 4),
                            Text(doc.semiologyTable, style: const TextStyle(fontSize: 13)),
                            const SizedBox(height: 10),
                            const Text('2. Histologia & Barreira Cutânea:', style: TextStyle(fontWeight: FontWeight.bold)),
                            const SizedBox(height: 4),
                            Text(doc.histologyContent, style: const TextStyle(fontSize: 13)),
                            const SizedBox(height: 10),
                            const Text('3. Diagnóstico Diferencial (Psoríase vs Líquen Plano):', style: TextStyle(fontWeight: FontWeight.bold)),
                            const SizedBox(height: 4),
                            Text(doc.differentialDiagnosis, style: const TextStyle(fontSize: 13)),
                            const SizedBox(height: 10),
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: const Color(0xFF00FF66).withOpacity(0.08),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('💡 Pérolas de Prova:', style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF00FF66))),
                                  const SizedBox(height: 4),
                                  Text(doc.pearlsOfWisdom, style: const TextStyle(fontSize: 12)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    }

                    return Align(
                      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: isUser ? const Color(0xFF00FF66).withOpacity(0.15) : theme.colorScheme.surface,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: theme.colorScheme.outline),
                        ),
                        child: Text(msg['text'] as String),
                      ),
                    );
                  },
                ),
        ),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border(top: BorderSide(color: theme.colorScheme.outline)),
          ),
          child: Row(
            children: [
              IconButton(
                icon: Icon(Icons.folder_outlined, color: _showDriveSelector ? const Color(0xFF00FF66) : null),
                tooltip: 'Materiais do Google Drive da Turma',
                onPressed: () => setState(() => _showDriveSelector = !_showDriveSelector),
              ),
              IconButton(
                icon: const Icon(Icons.menu_book_outlined),
                tooltip: 'Produzir Material de Leitura Médica',
                onPressed: _produceReadingMaterial,
              ),
              Expanded(
                child: TextField(
                  controller: _controller,
                  decoration: const InputDecoration(
                    hintText: 'Digite sua dúvida ou solicite leitura dos materiais marcados...',
                    border: InputBorder.none,
                  ),
                  onSubmitted: (_) => _sendMessage(),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.send_outlined, color: Color(0xFF00FF66)),
                onPressed: _sendMessage,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// 2. TELA DE FLASHCARDS COM REDUNDÂNCIA, EXCLUIR E ESTRELA
class FlashcardsScreen extends StatefulWidget {
  final List<SharedStudyItem> items;
  final Function(String, String, String) onAddMaterial;
  final Function(String) onDeleteItem;
  final Function(String) onToggleStar;
  final VoidCallback onShowHelp;

  const FlashcardsScreen({
    super.key,
    required this.items,
    required this.onAddMaterial,
    required this.onDeleteItem,
    required this.onToggleStar,
    required this.onShowHelp,
  });

  @override
  State<FlashcardsScreen> createState() => _FlashcardsScreenState();
}

class _FlashcardsScreenState extends State<FlashcardsScreen> {
  int _currentIndex = 0;
  bool _isFlipped = false;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          color: Theme.of(context).colorScheme.surface,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Repetição Espaçada Ativa', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              IconButton(icon: const Icon(Icons.help_outline, size: 18), onPressed: widget.onShowHelp),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: widget.items.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.style_outlined, size: 48, color: Color(0xFF00FF66)),
                      const SizedBox(height: 16),
                      const Text('Nenhum Flashcard Ativo', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      const Text('Envie apostilas ou crie cards a partir de aulas.', style: TextStyle(color: Colors.grey)),
                      const SizedBox(height: 16),
                      OutlinedButton.icon(
                        icon: const Icon(Icons.upload_file_outlined),
                        label: const Text('Carregar Primeiro Conteúdo'),
                        onPressed: () => widget.onAddMaterial(
                          'Classificação de NYHA para Insuficiência Cardíaca',
                          'Classe I (sem sintomas), Classe II (leves a esforços habituais), Classe III (limitação aos mínimos esforços), Classe IV (em repouso).',
                          'Cardiologia',
                        ),
                      ),
                    ],
                  ),
                )
              : Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 500),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (_currentIndex < widget.items.length) ...[
                          // Card de Alerta de Redundância (>= 50%)
                          if (widget.items[_currentIndex].isRedundant)
                            Container(
                              margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.amber.withOpacity(0.12),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: Colors.amber),
                              ),
                              child: Row(
                                children: [
                                  const Icon(Icons.warning_amber_outlined, color: Colors.amber, size: 24),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                      'Similaridade de ${(widget.items[_currentIndex].redundancyScore * 100).round()}% detectada com outro item da base!',
                                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.amber),
                                    ),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.delete_outline, color: Colors.red),
                                    tooltip: 'Excluir redundância',
                                    onPressed: () => widget.onDeleteItem(widget.items[_currentIndex].id),
                                  ),
                                  IconButton(
                                    icon: Icon(
                                      widget.items[_currentIndex].isStarred ? Icons.star : Icons.star_border_outlined,
                                      color: const Color(0xFF00FF66),
                                    ),
                                    tooltip: 'Favoritar para manter',
                                    onPressed: () => widget.onToggleStar(widget.items[_currentIndex].id),
                                  ),
                                ],
                              ),
                            ),
                          Card(
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                              side: BorderSide(color: Theme.of(context).colorScheme.outline),
                            ),
                            margin: const EdgeInsets.symmetric(horizontal: 20),
                            child: InkWell(
                              onTap: () => setState(() => _isFlipped = !_isFlipped),
                              borderRadius: BorderRadius.circular(16),
                              child: Container(
                                height: 260,
                                padding: const EdgeInsets.all(24),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text(
                                          widget.items[_currentIndex].subject.toUpperCase(),
                                          style: const TextStyle(color: Color(0xFF00FF66), fontWeight: FontWeight.bold, fontSize: 12),
                                        ),
                                        Text('Card ${_currentIndex + 1} de ${widget.items.length}', style: const TextStyle(color: Colors.grey, fontSize: 12)),
                                      ],
                                    ),
                                    Text(
                                      _isFlipped
                                          ? widget.items[_currentIndex].referenceAnswer
                                          : widget.items[_currentIndex].question,
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        fontSize: _isFlipped ? 15 : 18,
                                        fontWeight: _isFlipped ? FontWeight.normal : FontWeight.bold,
                                      ),
                                    ),
                                    const Text('Toque para virar o card', style: TextStyle(color: Colors.grey, fontSize: 11)),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              OutlinedButton(
                                onPressed: () {
                                  setState(() {
                                    _currentIndex = (_currentIndex + 1) % widget.items.length;
                                    _isFlipped = false;
                                  });
                                },
                                child: const Text('Próximo Card'),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
        ),
      ],
    );
  }
}

// 3. TELA DE QUIZZES & CASOS
class QuizzesScreen extends StatelessWidget {
  final List<SharedStudyItem> items;
  final Function(String, String, String) onAddMaterial;
  final Function(String) onDeleteItem;
  final Function(String) onToggleStar;
  final VoidCallback onShowHelp;

  const QuizzesScreen({
    super.key,
    required this.items,
    required this.onAddMaterial,
    required this.onDeleteItem,
    required this.onToggleStar,
    required this.onShowHelp,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          color: Theme.of(context).colorScheme.surface,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Banco de Casos e Questões', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              IconButton(icon: const Icon(Icons.help_outline, size: 18), onPressed: onShowHelp),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: items.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.quiz_outlined, size: 48, color: Color(0xFF00FF66)),
                      const SizedBox(height: 16),
                      const Text('Nenhum Quiz Disponível', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      const Text('Os quizzes compartilham a mesma base dos flashcards.', style: TextStyle(color: Colors.grey)),
                      const SizedBox(height: 16),
                      OutlinedButton.icon(
                        icon: const Icon(Icons.upload_file_outlined),
                        label: const Text('Carregar Questões'),
                        onPressed: () => onAddMaterial(
                          'Diagnóstico diferencial entre Cetoacidose e EHH',
                          'Cetoacidose apresenta acidose metabólica com gap aumentado e cetonemia positiva; EHH apresenta osmolaridade >320 mOsm/kg e glicemia severa.',
                          'Endocrinologia',
                        ),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: items.length,
                  itemBuilder: (ctx, i) {
                    final q = items[i];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(color: Theme.of(context).colorScheme.outline),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (q.isRedundant)
                              Container(
                                margin: const EdgeInsets.only(bottom: 10),
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: Colors.amber.withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: Colors.amber),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(Icons.warning_amber_outlined, color: Colors.amber, size: 20),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        'Item redundante (${(q.redundancyScore * 100).round()}% de similaridade)',
                                        style: const TextStyle(fontSize: 11, color: Colors.amber, fontWeight: FontWeight.bold),
                                      ),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.delete_outline, size: 18, color: Colors.red),
                                      onPressed: () => onDeleteItem(q.id),
                                    ),
                                    IconButton(
                                      icon: Icon(q.isStarred ? Icons.star : Icons.star_border_outlined, size: 18, color: const Color(0xFF00FF66)),
                                      onPressed: () => onToggleStar(q.id),
                                    ),
                                  ],
                                ),
                              ),
                            Text(q.subject.toUpperCase(), style: const TextStyle(color: Color(0xFF00FF66), fontSize: 11, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 6),
                            Text(q.question, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                            const SizedBox(height: 12),
                            ...q.quizOptions.map((opt) => Container(
                                  margin: const EdgeInsets.only(bottom: 6),
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: Theme.of(context).colorScheme.outline),
                                  ),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.radio_button_unchecked, size: 16),
                                      const SizedBox(width: 8),
                                      Expanded(child: Text(opt, style: const TextStyle(fontSize: 13))),
                                    ],
                                  ),
                                )),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

// 4. TELA DE MATÉRIAS CURRICULARES
class CurriculumScreen extends StatelessWidget {
  final List<UniversitySubject> subjects;
  final Function(List<String>) onLoadSyllabus;
  final VoidCallback onShowHelp;

  const CurriculumScreen({
    super.key,
    required this.subjects,
    required this.onLoadSyllabus,
    required this.onShowHelp,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          color: Theme.of(context).colorScheme.surface,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Grade Oficial Universitária', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              IconButton(icon: const Icon(Icons.help_outline, size: 18), onPressed: onShowHelp),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: subjects.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.menu_book_outlined, size: 48, color: Color(0xFF00FF66)),
                      const SizedBox(height: 16),
                      const Text('Nenhuma Matéria Carregada', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      const Text('Carregue sua ementa da faculdade para personalizar o currículo.', style: TextStyle(color: Colors.grey)),
                      const SizedBox(height: 16),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00FF66), foregroundColor: Colors.black),
                        icon: const Icon(Icons.upload_file),
                        label: const Text('Carregar Ementa da Faculdade'),
                        onPressed: () => onLoadSyllabus(['Cardiologia Clínica', 'Pneumologia', 'Gastroenterologia', 'Farmacologia Médica']),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: subjects.length,
                  itemBuilder: (ctx, i) {
                    final s = subjects[i];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: Theme.of(context).colorScheme.outline)),
                      child: ListTile(
                        leading: const Icon(Icons.bookmark_outline, color: Color(0xFF00FF66)),
                        title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('${s.period} • ${s.studiedItemsCount} itens dominados'),
                        trailing: Text('${s.masteryPercentage.toStringAsFixed(0)}% Maestria', style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF00FF66))),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

// 5. TELA DO SCE (SISTEMA DE CONHECIMENTO E EVOLUÇÃO) & ROTEIRO ADAPTATIVO
class SceEvolutionScreen extends StatelessWidget {
  final List<UniversitySubject> subjects;
  final AdaptiveStudyRoute route;
  final VoidCallback onRecalculateRoute;
  final VoidCallback onShowHelp;

  const SceEvolutionScreen({
    super.key,
    required this.subjects,
    required this.route,
    required this.onRecalculateRoute,
    required this.onShowHelp,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          color: Theme.of(context).colorScheme.surface,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('SCE: Sistema de Conhecimento e Evolução', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              IconButton(icon: const Icon(Icons.help_outline, size: 18), onPressed: onShowHelp),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // BANNER "WAZE DA MEDICINA" COM RECÁLCULO DE ROTA
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      const Color(0xFF00FF66).withOpacity(0.15),
                      const Color(0xFF00FF66).withOpacity(0.05),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFF00FF66).withOpacity(0.4)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Row(
                          children: [
                            Icon(Icons.alt_route_outlined, color: Color(0xFF00FF66)),
                            SizedBox(width: 8),
                            Text('Roteiro Adaptativo de Estudos', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          ],
                        ),
                        if (route.hasDelayedTasks)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: Colors.red.withOpacity(0.2),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: Colors.red),
                            ),
                            child: Text(
                              '${route.delayedTasksCount} tarefa(s) atrasada(s)',
                              style: const TextStyle(color: Colors.red, fontSize: 11, fontWeight: FontWeight.bold),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Seu plano de estudos adapta-se dinamicamente ao seu ritmo. Se você atrasar conteúdos, recalcule a rota para equilibrar a semana sem sobrecarga.',
                      style: TextStyle(fontSize: 13, color: Colors.grey),
                    ),
                    const SizedBox(height: 14),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF00FF66),
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      ),
                      icon: const Icon(Icons.sync_alt_outlined),
                      label: const Text('Recalcular Rota Agora', style: TextStyle(fontWeight: FontWeight.bold)),
                      onPressed: onRecalculateRoute,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // LISTA DE TAREFAS DO ROTEIRO
              const Text('Cronograma Otimizado da Semana', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              ...route.tasks.map((task) {
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: Theme.of(context).colorScheme.outline)),
                  child: ListTile(
                    leading: Icon(
                      task.isDelayed ? Icons.schedule_outlined : Icons.calendar_today_outlined,
                      color: task.isDelayed ? Colors.red : const Color(0xFF00FF66),
                    ),
                    title: Text(task.topic, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    subtitle: Text('${task.subjectName} • ${task.targetMinutes} min de revisão'),
                    trailing: task.isDelayed
                        ? const Text('Atrasado', style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold, fontSize: 11))
                        : const Text('Em dia', style: TextStyle(color: Color(0xFF00FF66), fontSize: 11)),
                  ),
                );
              }),
              const SizedBox(height: 24),

              // GRÁFICO DE EVOLUÇÃO POR DISCIPLINA
              const Text('Gráficos de Maestria e Retenção por Disciplina', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              ...['Cardiologia', 'Farmacologia', 'Pneumologia', 'Emergências Clínicas'].map((subj) {
                final mastery = subj == 'Cardiologia' ? 78 : (subj == 'Farmacologia' ? 62 : 45);
                final retention = (mastery * 0.9).round();
                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Theme.of(context).colorScheme.outline),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(subj, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                          Text('$mastery% Dominado (Retenção: $retention%)', style: const TextStyle(color: Color(0xFF00FF66), fontWeight: FontWeight.bold, fontSize: 12)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: LinearProgressIndicator(
                          value: mastery / 100.0,
                          minHeight: 8,
                          backgroundColor: Colors.grey.withOpacity(0.2),
                          color: const Color(0xFF00FF66),
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
      ],
    );
  }
}
