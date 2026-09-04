import 'package:flutter/material.dart';

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

  // Banco Unificado de Estudo (Começa vazio / Zero-State)
  final List<Map<String, dynamic>> _sharedItems = [];

  // Grade Curricular (Começa vazia até upload da ementa)
  final List<Map<String, dynamic>> _curriculumSubjects = [];

  void _addMaterialItem(String question, String answer, String subject) {
    setState(() {
      _sharedItems.add({
        'subject': subject,
        'question': question,
        'answer': answer,
        'quizOptions': [
          'Alternativa de conduta inicial correta',
          'Intervenção tardia ou inadequada',
          'Contraindicação absoluta',
          'Diagnóstico diferencial improvável'
        ],
        'correctIndex': 0,
      });
    });
  }

  void _loadSyllabus(List<String> subjects) {
    setState(() {
      _curriculumSubjects.clear();
      for (var s in subjects) {
        _curriculumSubjects.add({'name': s, 'mastery': 0.0});
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDesktop = MediaQuery.of(context).size.width > 768;

    final screens = [
      ChatScreen(
        onGenerateItem: _addMaterialItem,
      ),
      FlashcardsScreen(
        items: _sharedItems,
        onAddMaterial: _addMaterialItem,
      ),
      QuizzesScreen(
        items: _sharedItems,
        onAddMaterial: _addMaterialItem,
      ),
      CurriculumScreen(
        subjects: _curriculumSubjects,
        onLoadSyllabus: _loadSyllabus,
      ),
    ];

    if (isDesktop) {
      // Layout Desktop: Web e Windows com NavigationRail
      return Scaffold(
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
              trailing: Expanded(
                child: Align(
                  alignment: Alignment.bottomCenter,
                  child: IconButton(
                    icon: Icon(
                      widget.themeMode == ThemeMode.dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined,
                    ),
                    onPressed: widget.onToggleTheme,
                  ),
                ),
              ),
              destinations: const [
                NavigationRailDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: Text('Chat')),
                NavigationRailDestination(icon: Icon(Icons.style_outlined), selectedIcon: Icon(Icons.style), label: Text('Cards')),
                NavigationRailDestination(icon: Icon(Icons.quiz_outlined), selectedIcon: Icon(Icons.quiz), label: Text('Quizzes')),
                NavigationRailDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: Text('Matérias')),
              ],
            ),
            const VerticalDivider(width: 1),
            Expanded(child: screens[_selectedIndex]),
          ],
        ),
      );
    }

    // Layout Mobile: iOS e Android com NavigationBar inferior
    return Scaffold(
      appBar: AppBar(
        title: const Text('MedTutor Brasil', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        actions: [
          IconButton(
            icon: Icon(widget.themeMode == ThemeMode.dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
            onPressed: widget.onToggleTheme,
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => _openSettingsModal(context),
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
        ],
      ),
    );
  }

  void _openSettingsModal(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Configurações Básicas', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              ListTile(
                leading: const Icon(Icons.brightness_6_outlined),
                title: const Text('Modo Visual (Dia/Noite)'),
                trailing: Switch(
                  value: widget.themeMode == ThemeMode.dark,
                  onChanged: (_) => widget.onToggleTheme(),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.upload_file_outlined),
                title: const Text('Upload de Ementa Universitária'),
                subtitle: const Text('Gere sua grade de matérias a partir da faculdade'),
                onTap: () {
                  Navigator.pop(ctx);
                  _loadSyllabus(['Anatomia Humana', 'Fisiologia Médica', 'Semiologia', 'Farmacologia']);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Ementa carregada! Matérias criadas.')),
                  );
                },
              ),
            ],
          ),
        );
      },
    );
  }
}

// 1. ABA CHAT (COM UPLOAD DE MATERIAL DO ESTUDANTE)
class ChatScreen extends StatefulWidget {
  final Function(String, String, String) onGenerateItem;
  const ChatScreen({super.key, required this.onGenerateItem});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final List<Map<String, dynamic>> _messages = [];
  final TextEditingController _controller = TextEditingController();

  void _handleUploadMaterial() {
    widget.onGenerateItem(
      'Mecanismo de ação dos Inibidores da SGLT2',
      'Inibição de SGLT2 promovendo glicosúria, natriurese e proteção cardiovascular.',
      'Farmacologia',
    );
    setState(() {
      _messages.add({
        'isUser': true,
        'text': '📎 Material do Estudante Anexado: Resumo de Farmacologia Clínica',
      });
      _messages.add({
        'isUser': false,
        'text': '📚 Revisão do Material: Identifiquei os conceitos centrais. Foram gerados automaticamente novos Flashcards e Quizzes sincronizados nas respectivas abas!',
      });
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Material processado! Flashcards e Quizzes gerados.')),
    );
  }

  void _sendMessage() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _messages.add({'isUser': true, 'text': text});
      _messages.add({
        'isUser': false,
        'text': 'Revisão Sistemática: A literatura recente recomenda condutas baseadas em ensaios randomizados para "\$text".\\n\\n❓ Desafio Socrático: Qual o biomarcador inicial você avaliaria?',
      });
    });
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    if (_messages.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.chat_bubble_outline, size: 64, color: Color(0xFF00FF66)),
            const SizedBox(height: 16),
            const Text('Tutor Médico em Espera', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 32),
              child: Text(
                'Faça perguntas clínicas ou envie seus resumos de aula para gerar artigos e questões.',
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 20),
            OutlinedButton.icon(
              icon: const Icon(Icons.attach_file_outlined),
              label: const Text('Upload de Material do Estudante'),
              onPressed: _handleUploadMaterial,
            ),
          ],
        ),
      );
    }

    return Column(
      children: [
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: _messages.length,
            itemBuilder: (ctx, i) {
              final msg = _messages[i];
              final isUser = msg['isUser'] as bool;
              return Align(
                alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isUser ? const Color(0xFF151B18) : Theme.of(context).colorScheme.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: isUser ? const Color(0xFF00FF66).withOpacity(0.3) : Theme.of(context).colorScheme.outline),
                  ),
                  child: Text(msg['text']),
                ),
              );
            },
          ),
        ),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            border: Border(top: BorderSide(color: Theme.of(context).colorScheme.outline)),
          ),
          child: Row(
            children: [
              IconButton(
                icon: const Icon(Icons.attach_file_outlined),
                tooltip: 'Upload de Material do Estudante',
                onPressed: _handleUploadMaterial,
              ),
              Expanded(
                child: TextField(
                  controller: _controller,
                  decoration: const InputDecoration(
                    hintText: 'Digite uma dúvida ou caso clínico...',
                    border: InputBorder.none,
                  ),
                  onSubmitted: (_) => _sendMessage(),
                ),
              ),
              IconButton.filled(
                icon: const Icon(Icons.send_outlined),
                onPressed: _sendMessage,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// 2. ABA FLASHCARDS (MODO ESCRITA COM IA & TRADICIONAL)
class FlashcardsScreen extends StatelessWidget {
  final List<Map<String, dynamic>> items;
  final Function(String, String, String) onAddMaterial;

  const FlashcardsScreen({super.key, required this.items, required this.onAddMaterial});

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.style_outlined, size: 64, color: Color(0xFF00FF66)),
            const SizedBox(height: 16),
            const Text('Nenhum Flashcard Criado', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text('Faça upload de materiais de aula para gerar perguntas.'),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              icon: const Icon(Icons.upload_file_outlined),
              label: const Text('Upload de Resumo/Material'),
              onPressed: () {
                onAddMaterial(
                  'Qual a meta de redução horária da glicemia na CAD?',
                  '50 a 70 mg/dL por hora para prevenir edema cerebral.',
                  'Emergências',
                );
              },
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: items.length,
      itemBuilder: (ctx, i) {
        final item = items[i];
        return Card(
          child: ListTile(
            title: Text(item['question']),
            subtitle: Text('Disciplina: \${item['subject']}'),
            trailing: const Icon(Icons.chevron_right_outlined),
          ),
        );
      },
    );
  }
}

// 3. ABA QUIZZES
class QuizzesScreen extends StatelessWidget {
  final List<Map<String, dynamic>> items;
  final Function(String, String, String) onAddMaterial;

  const QuizzesScreen({super.key, required this.items, required this.onAddMaterial});

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            Icon(Icons.quiz_outlined, size: 64, color: Color(0xFF00FF66)),
            SizedBox(height: 16),
            Text('Nenhum Quiz Disponível', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            SizedBox(height: 8),
            Text('O upload de material em Flashcards também alimenta os Quizzes.'),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: items.length,
      itemBuilder: (ctx, i) {
        final item = items[i];
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item['subject'], style: const TextStyle(color: Color(0xFF00FF66), fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text(item['question'], style: const TextStyle(fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        );
      },
    );
  }
}

// 4. ABA MATÉRIAS
class CurriculumScreen extends StatelessWidget {
  final List<Map<String, dynamic>> subjects;
  final Function(List<String>) onLoadSyllabus;

  const CurriculumScreen({super.key, required this.subjects, required this.onLoadSyllabus});

  @override
  Widget build(BuildContext context) {
    if (subjects.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.menu_book_outlined, size: 64, color: Color(0xFF00FF66)),
            const SizedBox(height: 16),
            const Text('Nenhuma Disciplina Carregada', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text('Carregue a ementa da sua faculdade nas configurações para começar.'),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              icon: const Icon(Icons.upload_file_outlined),
              label: const Text('Carregar Ementa Universitária'),
              onPressed: () {
                onLoadSyllabus(['Anatomia Humana', 'Fisiologia Médica', 'Semiologia', 'Farmacologia']);
              },
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: subjects.length,
      itemBuilder: (ctx, i) {
        final s = subjects[i];
        return Card(
          child: ListTile(
            leading: const Icon(Icons.circle_outlined, color: Color(0xFF00FF66)),
            title: Text(s['name']),
            trailing: Text('\${(s['mastery'] * 100).toInt()}%'),
          ),
        );
      },
    );
  }
}
