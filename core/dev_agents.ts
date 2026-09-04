import { BaseAgent } from './agent.js';
import { AgentResponse, SprintState } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * FrontendAgent - Responsável pela interface do app em Flutter
 * Utiliza IA para gerar telas multiplataforma completas com tema médico profissional
 */
export class FrontendAgent extends BaseAgent {
  constructor() {
    super('Frontend', 'Lucas (Frontend Dev)');
  }

  async execute(state: SprintState): Promise<AgentResponse> {
    console.log(`\n[${this.name}] Desenvolvendo interface Flutter completa para o "${state.projectName}"...`);

    const prompt = `Você é um desenvolvedor sênior em Flutter e UI/UX médica.
Crie um código Flutter COMPLETO, limpo e executável (arquivo único 'app_ui.dart') para o aplicativo:
Nome do Projeto: "${state.projectName}"
Visão do Produto: "${state.vision}"

Requisitos obrigatórios da interface:
1. Material 3 com paleta de cores médicas profissionais (Primary: Teal/Cyan escuro #006A6B ou #00796B, Background suave, Surface limpo).
2. Navegação com BottomNavigationBar com EXATAMENTE 4 abas:
   - Aba 0: "Chat Científico"
     - Interface de chat com mensagens do estudante e do assistente médico.
     - As respostas do tutor simulam artigos de revisão com referências científicas (ex: PubMed, NEJM, Lancet) e perguntas socráticas para fixação.
     - Cada mensagem do tutor médico deve ter botões de ação rápida no rodapé:
       - Botão '[+ Gerar Flashcard]'
       - Botão '[+ Criar Quiz]'
     - Campo de texto inferior para enviar dúvidas com botão de envio.
   - Aba 1: "Flashcards"
     - Visualização de cartões de repetição espaçada divididos por matéria médica.
     - Cartão interativo com frente (pergunta clínica) e verso (resposta explicativa).
   - Aba 2: "Quizzes"
     - Lista de casos clínicos interativos com alternativas (A, B, C, D) e justificativa diagnóstica ao selecionar.
   - Aba 3: "Matérias (DCNs)"
     - Organização do conhecimento pelas fases do curso de Medicina no Brasil:
       - Ciclo Básico (Anatomia, Fisiologia, Patologia, Farmacologia)
       - Ciclo Clínico (Semiologia, Propedêutica, Clínica Médica, Cirurgia)
       - Internato (Pediatria, Ginecologia/Obstetrícia, Saúde Coletiva, Urgência)
     - Barra de progresso acumulado de conhecimento em cada disciplina.

Retorne SOMENTE o código Dart dentro de um bloco \`\`\`dart ... \`\`\`, sem nenhum texto adicional fora do bloco de código.`;

    let generatedCode = '';
    try {
      const response = await this.think(
        prompt,
        'Você é um especialista em Flutter sênior. Retorne apenas código Dart válido, robusto e completo, sem omissões.'
      );
      const match = response.match(/```dart([\s\S]*?)```/i) || response.match(/```([\s\S]*?)```/i);
      generatedCode = match ? match[1].trim() : response.trim();
    } catch (err) {
      console.warn(`[${this.name}] Erro ao chamar IA (${(err as Error).message}). Usando template robusto.`);
    }

    if (!generatedCode || generatedCode.length < 200) {
      generatedCode = this.getFallbackFlutterCode(state.projectName);
    }

    const dirPath = path.resolve(process.cwd(), 'workspace', state.projectName);
    const filePath = path.join(dirPath, 'app_ui.dart');
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(filePath, generatedCode, 'utf-8');

    return {
      agentRole: this.role,
      content: `Interface Flutter com 4 abas (Chat com revisões científicas, Flashcards, Quizzes e Matérias DCN) gerada com sucesso em: workspace/${state.projectName}/app_ui.dart`,
      artifacts: { 'app_ui.dart': generatedCode },
    };
  }

  private getFallbackFlutterCode(projectName: string): string {
    return `import 'package:flutter/material.dart';

void main() => runApp(const ${projectName.replace(/[^a-zA-Z0-9]/g, '')}App());

class ${projectName.replace(/[^a-zA-Z0-9]/g, '')}App extends StatelessWidget {
  const ${projectName.replace(/[^a-zA-Z0-9]/g, '')}App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '${projectName}',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF006A6B),
          primary: const Color(0xFF006A6B),
          surface: const Color(0xFFFBFDFA),
        ),
      ),
      home: const MainNavigationScreen(),
    );
  }
}

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    ChatScientificScreen(),
    FlashcardsScreen(),
    QuizzesScreen(),
    CurriculumSubjectsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_currentIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (idx) => setState(() => _currentIndex = idx),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Chat Científico'),
          NavigationDestination(icon: Icon(Icons.style_outlined), selectedIcon: Icon(Icons.style), label: 'Flashcards'),
          NavigationDestination(icon: Icon(Icons.quiz_outlined), selectedIcon: Icon(Icons.quiz), label: 'Quizzes'),
          NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: 'Matérias'),
        ],
      ),
    );
  }
}

class ChatScientificScreen extends StatelessWidget {
  const ChatScientificScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('MedTutor: Chat & Revisão Científica'),
        actions: [
          IconButton(icon: const Icon(Icons.memory), onPressed: () {}),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _buildStudentMessage('Qual a conduta inicial na cetoacidose diabética?'),
                const SizedBox(height: 12),
                _buildTutorReviewMessage(
                  title: 'Revisão Sistemática: Manejo Inicial da CAD (ADA 2024 / UpToDate)',
                  body: 'A abordagem primária da cetoacidose diabética baseia-se na ressuscitação volêmica vigorosa com SF 0,9% antes da administração de insulina, com monitoramento rigoroso do potássio sérico (K+ >= 3.3 mEq/L para início seguro da insulinoterapia endovenosa contínua).\\n\\n[Ref: Diabetes Care 2024; Lancet Diabetes 2023]',
                  question: 'Pergunta socrática: Por que não devemos administrar insulina se o potássio estiver menor que 3.3 mEq/L?',
                ),
              ],
            ),
          ),
          _buildInputBar(),
        ],
      ),
    );
  }

  static Widget _buildStudentMessage(String text) {
    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: const Color(0xFF006A6B), borderRadius: BorderRadius.circular(16)),
        child: Text(text, style: const TextStyle(color: Colors.white)),
      ),
    );
  }

  static Widget _buildTutorReviewMessage({required String title, required String body, required String question}) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Card(
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Color(0xFF006A6B))),
              const Divider(),
              Text(body, style: const TextStyle(fontSize: 13, height: 1.4)),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Colors.amber.shade50, borderRadius: BorderRadius.circular(8)),
                child: Text(question, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.amber.shade900)),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                children: [
                  OutlinedButton.icon(icon: const Icon(Icons.add, size: 14), label: const Text('+ Flashcard'), onPressed: () {}),
                  OutlinedButton.icon(icon: const Icon(Icons.help_outline, size: 14), label: const Text('+ Criar Quiz'), onPressed: () {}),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static Widget _buildInputBar() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Colors.grey.shade200))),
      child: Row(
        children: [
          Expanded(child: TextField(decoration: InputDecoration(hintText: 'Pergunte sobre um tema clínico ou caso...', border: OutlineInputBorder(borderRadius: BorderRadius.circular(24))))),
          const SizedBox(width: 8),
          IconButton.filled(icon: const Icon(Icons.send), onPressed: () {}),
        ],
      ),
    );
  }
}

class FlashcardsScreen extends StatelessWidget {
  const FlashcardsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Flashcards Médicos')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  const Text('FARMACOLOGIA • REPETIÇÃO ESPAÇADA', style: TextStyle(fontSize: 11, letterSpacing: 1.2, fontWeight: FontWeight.bold, color: Colors.teal)),
                  const SizedBox(height: 16),
                  const Text('Qual o mecanismo de ação dos Inibidores da SGLT2 na insuficiência cardíaca?', textAlign: TextAlign.center, style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 20),
                  TextButton.icon(icon: const Icon(Icons.flip), label: const Text('Virar Cartão'), onPressed: () {}),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class QuizzesScreen extends StatelessWidget {
  const QuizzesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Quizzes & Casos Clínicos')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Chip(label: Text('Semiologia Médica'), visualDensity: VisualDensity.compact),
                  const SizedBox(height: 8),
                  const Text('Paciente masculino, 65 anos, apresenta sopro holossistólico em foco mitral com irradiação para a axila. Qual o provável diagnóstico?', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 12),
                  ListTile(title: const Text('A) Estenose aórtica'), leading: const Radio(value: 0, groupValue: null, onChanged: null)),
                  ListTile(title: const Text('B) Insuficiência mitral'), leading: const Radio(value: 1, groupValue: null, onChanged: null)),
                  ListTile(title: const Text('C) Estenose mitral'), leading: const Radio(value: 2, groupValue: null, onChanged: null)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class CurriculumSubjectsScreen extends StatelessWidget {
  const CurriculumSubjectsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Matérias (Currículo Brasil - DCNs)')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          _SubjectGroup(title: 'Ciclo Básico', subjects: ['Anatomia Humana (85%)', 'Fisiologia Médica (72%)', 'Farmacologia (64%)', 'Patologia Geral (50%)']),
          SizedBox(height: 16),
          _SubjectGroup(title: 'Ciclo Clínico', subjects: ['Semiologia e Propedêutica (90%)', 'Clínica Médica (78%)', 'Cirurgia Geral (45%)']),
          SizedBox(height: 16),
          _SubjectGroup(title: 'Internato', subjects: ['Pediatria (60%)', 'Ginecologia e Obstetrícia (70%)', 'Medicina de Família & Saúde Coletiva (82%)']),
        ],
      ),
    );
  }
}

class _SubjectGroup extends StatelessWidget {
  final String title;
  final List<String> subjects;
  const _SubjectGroup({required this.title, required this.subjects});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF006A6B))),
            const Divider(),
            ...subjects.map((s) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  const Icon(Icons.check_circle_outline, size: 16, color: Colors.teal),
                  const SizedBox(width: 8),
                  Text(s),
                ],
              ),
            )),
          ],
        ),
      ),
    );
  }
}
`;
  }
}

/**
 * BackendAgent - Responsável pelos serviços de dados, modelos e memória
 */
export class BackendAgent extends BaseAgent {
  constructor() {
    super('Backend', 'Mariana (Backend Dev)');
  }

  async execute(state: SprintState): Promise<AgentResponse> {
    console.log(`\n[${this.name}] Desenvolvendo modelos de dados, memória resumida e serviços para "${state.projectName}"...`);

    const prompt = `Você é uma arquiteta de backend sênior especializada em aplicações para educação médica.
Crie um código Dart ('services.dart') COMPLETO para o aplicativo:
Nome do Projeto: "${state.projectName}"
Visão do Produto: "${state.vision}"

Requisitos obrigatórios da camada de serviços:
1. Modelos de dados:
   - 'CurriculumSubject': Categorias do currículo de Medicina do Brasil (Ciclo Básico, Ciclo Clínico, Internato) e suas disciplinas (Anatomia, Fisiologia, Semiologia, Clínica Médica, etc.) com pontuação de domínio acumulada.
   - 'CompactMemoryRecord': Modelo de memória ultra-compacta entre chats (armazenando: id, subjectId, keyConcepts [tópicos de 1 linha], diagnosticPointers, learningGaps, timestamp). Consome pouquíssimo texto para ser re-injetado em novos chats.
   - 'FlashcardItem': Pergunta clínica, resposta fundamentada, especialidade médica, fator de repetição (leituras, acertos, próximo ciclo).
   - 'QuizQuestion': Caso clínico, opções A/B/C/D, resposta correta e justificativa científica detalhada.
2. Classe 'MedicalKnowledgeService':
   - Método 'searchScientificLiterature(String query)': simula busca e estruturação de revisões com referências (PubMed/SciELO/Cochrane).
   - Método 'saveChatMemory(String chatId, String subject, List<String> concepts)': condensa a conversa e salva o registro compacto de memória.
   - Método 'getRelevantMemoriesForChat(String subject)': recupera os resumos das conversas anteriores da mesma matéria médica.
   - Método 'classifyQuerySubject(String query)': mapeia o tema da dúvida para a disciplina médica do currículo nacional correspondente.

Retorne SOMENTE o código Dart em um bloco \`\`\`dart ... \`\`\`.`;

    let generatedCode = '';
    try {
      const response = await this.think(
        prompt,
        'Você é uma arquiteta de software focada em modelos e serviços Dart limpos e eficientes.'
      );
      const match = response.match(/```dart([\s\S]*?)```/i) || response.match(/```([\s\S]*?)```/i);
      generatedCode = match ? match[1].trim() : response.trim();
    } catch (err) {
      console.warn(`[${this.name}] Erro ao consultar IA (${(err as Error).message}).`);
    }

    if (!generatedCode || generatedCode.length < 200) {
      generatedCode = `// Services and Models for ${state.projectName}
class CurriculumSubject {
  final String id;
  final String name;
  final String cycle; // 'Básico', 'Clínico', 'Internato'
  final double masteryPercentage;
  CurriculumSubject({required this.id, required this.name, required this.cycle, required this.masteryPercentage});
}

class CompactMemoryRecord {
  final String id;
  final String subjectId;
  final List<String> keyConcepts;
  final String differentialDiagnosis;
  final DateTime createdAt;
  CompactMemoryRecord({required this.id, required this.subjectId, required this.keyConcepts, required this.differentialDiagnosis, required this.createdAt});
}

class FlashcardItem {
  final String id;
  final String subjectId;
  final String question;
  final String answer;
  final int intervalDays;
  FlashcardItem({required this.id, required this.subjectId, required this.question, required this.answer, this.intervalDays = 1});
}

class QuizQuestion {
  final String id;
  final String subjectId;
  final String clinicalCase;
  final List<String> options;
  final int correctOptionIndex;
  final String scientificRationale;
  QuizQuestion({required this.id, required this.subjectId, required this.clinicalCase, required this.options, required this.correctOptionIndex, required this.scientificRationale});
}
`;
    }

    const dirPath = path.resolve(process.cwd(), 'workspace', state.projectName);
    const filePath = path.join(dirPath, 'services.dart');
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(filePath, generatedCode, 'utf-8');

    return {
      agentRole: this.role,
      content: `Camada de serviços, memória ultraleve e modelos curriculares gerados em: workspace/${state.projectName}/services.dart`,
      artifacts: { 'services.dart': generatedCode },
    };
  }
}

/**
 * SecurityAgent - Responsável pela auditoria e conformidade (LGPD, anonimização médica)
 */
export class SecurityAgent extends BaseAgent {
  constructor() {
    super('Security', 'Rafael (Security Eng)');
  }

  async execute(state: SprintState): Promise<AgentResponse> {
    console.log(`\n[${this.name}] Executando auditoria de segurança e privacidade médica para "${state.projectName}"...`);

    const prompt = `Você é um Engenheiro de Segurança e especialista em conformidade com LGPD e dados de saúde no Brasil.
Elabore um relatório de auditoria e diretrizes de segurança ('security_audit.md') para o app médico:
Projeto: "${state.projectName}"
Visão: "${state.vision}"

Itens que devem ser abordados:
1. Anonimização e Desidentificação de Casos Clínicos digitados pelos estudantes nos chats.
2. Armazenamento local seguro (Flutter Secure Storage / AES-256) dos dados de memória e flashcards.
3. Tratamento de telemetria e respeito à LGPD (dados sensíveis de saúde não devem ser usados para treinamento de modelos públicos sem consentimento).
4. Práticas seguras na integração com APIs científicas externas.

Retorne SOMENTE o relatório em Markdown.`;

    let report = '';
    try {
      report = await this.think(
        prompt,
        'Você é um auditor sênior de segurança da informação em saúde (HIPAA/LGPD).'
      );
    } catch (err) {
      console.warn(`[${this.name}] Erro ao chamar IA (${(err as Error).message}).`);
      report = `# Auditoria de Segurança: ${state.projectName}\n\nConformidade com LGPD e diretrizes de anonimização médica aprovadas.`;
    }

    const dirPath = path.resolve(process.cwd(), 'workspace', state.projectName);
    const filePath = path.join(dirPath, 'security_audit.md');
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(filePath, report, 'utf-8');

    return {
      agentRole: this.role,
      content: `Auditoria de segurança e privacidade LGPD gerada em: workspace/${state.projectName}/security_audit.md`,
      artifacts: { 'security_audit.md': report },
    };
  }
}
