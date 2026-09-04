export type AgentRole = 'PO' | 'ScrumMaster' | 'Frontend' | 'Backend' | 'Security' | 'QA';

export interface Task {
  id: number;
  role: AgentRole;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
}

export interface SprintState {
  projectName: string;
  vision: string;
  backlog: Task[];
  currentSprint: number;
}

export interface AgentResponse {
  agentRole: AgentRole;
  content: string;
  artifacts?: Record<string, string>; // Arquivos gerados (ex: caminho -> código)
}
