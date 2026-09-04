import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import type { AgentRole } from './types.js';

dotenv.config();

export type ModelTier = 'FAST' | 'BALANCED' | 'REASONING' | 'CODE';

export interface ModelRequestOptions {
  tier?: ModelTier;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  systemInstruction?: string;
}

export interface ModelResponse {
  content: string;
  model: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * ModelRouter - Orquestrador de modelos com suporte nativo ao SDK Google GenAI
 */
export class ModelRouter {
  private client?: GoogleGenAI;
  private apiKey?: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (this.apiKey) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }
  }

  /**
   * Determina o tier de modelo recomendado de acordo com a responsabilidade do papel
   */
  public getTierForRole(role: AgentRole): ModelTier {
    switch (role) {
      case 'PO':
      case 'Security':
        return 'REASONING';
      case 'Frontend':
      case 'Backend':
      case 'QA':
        return 'CODE';
      case 'ScrumMaster':
      default:
        return 'BALANCED';
    }
  }

  /**
   * Mapeia o tier para o modelo concreto (usando os modelos atuais: gemini-3.7-flash, gemini-3.5-flash-lite)
   */
  public resolveModel(tier: ModelTier = 'BALANCED'): string {
    const tierMap: Record<ModelTier, string> = {
      FAST: process.env.MODEL_FAST || 'gemini-3.5-flash-lite',
      BALANCED: process.env.MODEL_BALANCED || 'gemini-3.7-flash',
      REASONING: process.env.MODEL_REASONING || 'gemini-3.7-flash',
      CODE: process.env.MODEL_CODE || 'gemini-3.7-flash',
    };

    return tierMap[tier];
  }

  /**
   * Roteia a chamada para a API do Gemini via GoogleGenAI SDK (ou fallback se offline)
   */
  public async route(prompt: string, options: ModelRequestOptions = {}): Promise<ModelResponse> {
    const tier = options.tier || 'BALANCED';
    const model = options.modelName || this.resolveModel(tier);

    if (this.client) {
      try {
        const interaction = await this.client.interactions.create({
          model,
          input: prompt,
          system_instruction: options.systemInstruction,
        });

        return {
          content: interaction.output_text || '',
          model,
        };
      } catch (err) {
        console.warn(`[ModelRouter] Falha ao consultar Gemini (${(err as Error).message}). Usando fallback de simulação.`);
      }
    }

    // Modo Simulação / Offline para desenvolvimento e testes
    return this.mockResponse(prompt, model, options);
  }

  private mockResponse(
    prompt: string,
    model: string,
    options: ModelRequestOptions
  ): ModelResponse {
    const prefix = options.systemInstruction ? `[Context: ${options.systemInstruction.slice(0, 30)}...] ` : '';
    return {
      content: `${prefix}[Simulated Response from ${model}] Processed request: "${prompt.slice(0, 80)}..."`,
      model: `${model} (offline-simulation)`,
      tokenUsage: {
        promptTokens: Math.ceil(prompt.length / 4),
        completionTokens: 30,
        totalTokens: Math.ceil(prompt.length / 4) + 30,
      },
    };
  }
}
