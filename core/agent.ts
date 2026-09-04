import { ModelRouter } from './router.js';
import { AgentRole, AgentResponse, SprintState } from './types.js';

export abstract class BaseAgent {
  protected role: AgentRole;
  protected name: string;
  protected router: ModelRouter;

  constructor(role: AgentRole, name: string, router?: ModelRouter) {
    this.role = role;
    this.name = name;
    this.router = router || new ModelRouter();
  }

  public getRole(): AgentRole {
    return this.role;
  }

  public getName(): string {
    return this.name;
  }

  /**
   * Envia uma reflexão/instrução para a IA usando o modelo adequado ao papel deste agente
   */
  protected async think(prompt: string, systemInstruction?: string): Promise<string> {
    const tier = this.router.getTierForRole(this.role);
    const response = await this.router.route(prompt, {
      tier,
      systemInstruction,
    });
    return response.content;
  }

  // Cada agente especializado implementará sua própria lógica de execução
  abstract execute(state: SprintState): Promise<AgentResponse>;
}
