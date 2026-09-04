import { SprintState } from './core/types.js';
import { ProductOwnerAgent } from './core/po_agent.js';
import { ScrumMasterAgent } from './core/sm_agent.js';
import { FrontendAgent, BackendAgent, SecurityAgent } from './core/dev_agents.js';
import { QAAgent } from './core/qa_agent.js';

async function runFactory() {
  const state: SprintState = {
    projectName: 'MedTutorBrasil',
    vision:
      'Aplicativo inteligente de apoio para estudantes de medicina no Brasil. ' +
      'Utiliza bases científicas (PubMed, SciELO, UpToDate) para corroborar o estudo do aluno gerando artigos de revisões bibliográficas integrados com perguntas reflexivas/socráticas na aba de Chat. ' +
      'Possui criação de flashcards via botão direto no chat e em aba dedicada de flashcards com repetição espaçada. ' +
      'Possui criação de quizzes no chat e em aba dedicada com resolução comentada. ' +
      'Implementa sistema de memória resumida e ultra-eficiente entre chats para consulta contextual contínua consumindo mínimo espaço. ' +
      'Classifica automaticamente o aprendizado nas matérias da grade curricular médica brasileira (Ciclo Básico, Clínico e Internato), acumulando conhecimento ao longo do curso na aba de matérias.',
    backlog: [],
    currentSprint: 1,
  };

  console.log('======================================================================');
  console.log(`🏥 INICIANDO FÁBRICA DE AGENTES SCRUM: ${state.projectName}`);
  console.log(`🎯 PÚBLICO & ESCOPO: Estudantes de Medicina (Currículo Brasil / DCNs)`);
  console.log('======================================================================\n');

  const po = new ProductOwnerAgent();
  const sm = new ScrumMasterAgent();
  const frontend = new FrontendAgent();
  const backend = new BackendAgent();
  const security = new SecurityAgent();
  const qa = new QAAgent();

  // 1. PO analisa a visão com Gemini e cria o backlog dinâmico
  const poRes = await po.execute(state);
  console.log(`\n📢 [Retorno do ${poRes.agentRole}]: ${poRes.content}`);
  console.log(`📋 Tarefas criadas pela IA no Backlog:`);
  state.backlog.forEach(t => {
    console.log(`   • [Task #${t.id}] (${t.role}): ${t.title}`);
    console.log(`     └─ ${t.description}`);
  });

  // 2. SM organiza a sprint e alinha os especialistas
  const smRes = await sm.execute(state);
  console.log(`\n📢 [Retorno do ${smRes.agentRole}]:`);
  console.log(smRes.content);

  // 3. Especialistas de desenvolvimento executam com IA
  const frontRes = await frontend.execute(state);
  console.log(`\n📢 [Retorno do ${frontRes.agentRole}]: ${frontRes.content}`);

  const backRes = await backend.execute(state);
  console.log(`\n📢 [Retorno do ${backRes.agentRole}]: ${backRes.content}`);

  const secRes = await security.execute(state);
  console.log(`\n📢 [Retorno do ${secRes.agentRole}]: ${secRes.content}`);

  // 4. QA valida a entrega e gera a suíte de testes
  const qaRes = await qa.execute(state);
  console.log(`\n📢 [Retorno do ${qaRes.agentRole}]: ${qaRes.content}`);

  console.log('\n======================================================================');
  console.log(`🎉 SPRINT FINALIZADA COM SUCESSO!`);
  console.log(`📁 Artefatos gerados em: workspace/${state.projectName}/`);
  console.log(`   ├─ app_ui.dart          (Interface Flutter com 4 Abas: Chat, Flashcards, Quizzes, Matérias)`);
  console.log(`   ├─ services.dart        (Serviços, Modelos DCNs e Memória Ultra-Compacta)`);
  console.log(`   ├─ security_audit.md    (Auditoria de Segurança e Conformidade LGPD Médica)`);
  console.log(`   └─ test_suite.dart      (Suíte de Testes Automatizados em Dart)`);
  console.log('======================================================================');
}

runFactory();
