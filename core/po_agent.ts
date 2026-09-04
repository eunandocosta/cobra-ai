import { BaseAgent } from './agent.js';
import { AgentResponse, SprintState, Task } from './types.js';

export class ProductOwnerAgent extends BaseAgent {
  constructor() {
    super('PO', 'Ana (Product Owner)');
  }

  async execute(state: SprintState): Promise<AgentResponse> {
    console.log(`\n[${this.name}] Analisando a visão do produto com Gemini: "${state.vision}"...`);

    const prompt = `Você é uma Product Owner especialista em Scrum e desenvolvimento multiplataforma (Flutter / Web / Mobile / Desktop).
Projeto: "${state.projectName}"
Visão: "${state.vision}"
Sprint atual: #${state.currentSprint}

Analise a visão do produto e divida em 3 tarefas essenciais para esta sprint, cobrindo:
1) Frontend (interface em Flutter)
2) Backend (serviços/dados)
3) Security (segurança/criptografia)

Retorne SOMENTE um JSON válido com a lista de tarefas (sem explicações adicionais):
[
  {
    "id": 1,
    "role": "Frontend",
    "title": "título da tarefa de frontend",
    "description": "descrição detalhada",
    "status": "todo"
  },
  {
    "id": 2,
    "role": "Backend",
    "title": "título da tarefa de backend",
    "description": "descrição detalhada",
    "status": "todo"
  },
  {
    "id": 3,
    "role": "Security",
    "title": "título da tarefa de segurança",
    "description": "descrição detalhada",
    "status": "todo"
  }
]`;

    let generatedTasks: Task[] = [];
    try {
      const responseText = await this.think(
        prompt,
        'Você é uma Product Owner sênior focada em gerar backlogs técnicos precisos estritamente em formato JSON.'
      );
      const cleanedJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        generatedTasks = parsed.map((item, index) => ({
          id: item.id || index + 1,
          role: item.role || 'Frontend',
          title: item.title,
          description: item.description,
          status: 'todo',
        }));
      }
    } catch (err) {
      console.warn(`[${this.name}] Erro ao parsear JSON da IA (${(err as Error).message}). Usando fallback.`);
    }

    if (generatedTasks.length === 0) {
      generatedTasks = [
        {
          id: 1,
          role: 'Frontend',
          title: `Criar UI Multiplataforma para ${state.projectName}`,
          description: `Desenvolver interface em Flutter com base na visão: ${state.vision}`,
          status: 'todo',
        },
        {
          id: 2,
          role: 'Backend',
          title: 'Configurar Camada de Serviços e Dados',
          description: 'Implementar persistência e integração de serviços para suportar os fluxos principais.',
          status: 'todo',
        },
        {
          id: 3,
          role: 'Security',
          title: 'Auditar Segurança e Criptografia Local',
          description: 'Implementar proteção de credenciais e validação segura de inputs.',
          status: 'todo',
        },
      ];
    }

    state.backlog = generatedTasks;

    return {
      agentRole: this.role,
      content: `Backlog da Sprint #${state.currentSprint} gerado por IA com sucesso contendo ${generatedTasks.length} histórias de usuário.`
    };
  }
}
