import { BaseAgent } from './agent.js';
import { AgentResponse, SprintState } from './types.js';

export class ScrumMasterAgent extends BaseAgent {
  constructor() {
    super('ScrumMaster', 'Carlos (Scrum Master)');
  }

  async execute(state: SprintState): Promise<AgentResponse> {
    console.log(`\n[${this.name}] Organizando a Sprint #${state.currentSprint} e alinhando os especialistas...`);

    if (!state.backlog || state.backlog.length === 0) {
      return {
        agentRole: this.role,
        content: 'Nenhuma tarefa encontrada no backlog para iniciar a Sprint.'
      };
    }

    // Organiza e atualiza o status das tarefas para 'in_progress'
    state.backlog = state.backlog.map(task => ({
      ...task,
      status: 'in_progress'
    }));

    const taskSummary = state.backlog.map(t => `- [Task #${t.id}] Atribuída a [${t.role}]: ${t.title}`).join('\n');

    return {
      agentRole: this.role,
      content: `Sprint #${state.currentSprint} iniciada com sucesso!\n\nTarefas em andamento:\n${taskSummary}`
    };
  }
}
