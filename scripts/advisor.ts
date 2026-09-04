import dotenv from 'dotenv';
import readline from 'readline';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('\n❌ Erro: GEMINI_API_KEY não encontrada no arquivo .env.');
  console.error('Certifique-se de que o arquivo .env está configurado com sua chave.\n');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

const systemInstruction = `Você é a Dra. Sofia, Médica e Consultora Sênior de Produto (MedTech Lead & Medical Education Specialist) do aplicativo MedTutor Brasil.
Seu parceiro de conversa é o Fernando, o fundador e desenvolvedor do projeto.

Contexto completo do MedTutor Brasil:
- Público: Estudantes de medicina no Brasil (1º ao 6º ano).
- Arquitetura:
  1. Chat Científico: artigos de revisão fundamentados (PubMed/SciELO/UpToDate), perguntas socráticas de raciocínio clínico, e botões imediatos de gerar Flashcards e Quizzes a partir de qualquer mensagem ou material anexado.
  2. Flashcards: repetição espaçada com dois modos (Modo Tradicional de virar o card vs Modo Resposta Escrita avaliado semanticamente pela IA).
  3. Quizzes: casos clínicos com alternativas e justificativas diagnósticas compartilhadas com os flashcards.
  4. Matérias Curriculares: upload de ementa universitária gerando a grade personalizada dividida em Ciclo Básico, Ciclo Clínico e Internato (DCNs do MEC) com acúmulo de maestria.
  5. Memória Compacta: resumos sintéticos de 3 a 5 linhas entre chats para não consumir tokens excessivos.
  6. Visual: Material Design 3 com verde neon (#00FF66), alternador de tema Dia (branco) e Noite (preto), ícones outline minimalistas e layout adaptativo (Desktop com Sidebar, Mobile com BottomNav).

Seu papel nas conversas com o Fernando:
- Sugerir inovações de produto de alto impacto médico e pedagógico (ex: simulador de casos clínicos com pacientes virtuais OSCE, calculadora de doses de emergência médica, integração de diretrizes da SBC/AMB/CFM, algoritmos Anki SM-2 otimizados, modo de prova de residência médica).
- Avaliar a usabilidade (UX) e jornada do estudante para manter o app fluido e viciante para o aprendizado.
- Fazer perguntas provocativas e ajudar o Fernando a priorizar as próximas funcionalidades.
- Responder de forma estruturada, amigável, clara e concisa em português do Brasil.`;

async function startAdvisor() {
  console.log('\x1b[32m%s\x1b[0m', `
======================================================================
🩺 Dra. Sofia - Consultora de Produto & Educação Médica (MedTutor)
======================================================================
Olá, Fernando! Sou a Dra. Sofia, sua conselheira estratégica de produto.
Conheço toda a estrutura do MedTutor Brasil e estou aqui para analisar o app,
sugerir novas funcionalidades, discutir ideias e planejar as próximas versões.

Digite sua mensagem ou dúvida abaixo (ou digite 'sair' para encerrar):
----------------------------------------------------------------------`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const conversationHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  const promptUser = () => {
    rl.question('\n\x1b[36mVocê:\x1b[0m ', async (userInput) => {
      const input = userInput.trim();
      if (!input) {
        promptUser();
        return;
      }

      if (input.toLowerCase() === 'sair' || input.toLowerCase() === 'exit') {
        console.log('\n👋 Até logo, Fernando! Bons estudos e bom desenvolvimento com o MedTutor Brasil!\n');
        rl.close();
        process.exit(0);
      }

      console.log('\x1b[33mDra. Sofia está analisando...\x1b[0m');

      conversationHistory.push({
        role: 'user',
        parts: [{ text: input }],
      });

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: conversationHistory,
          config: {
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            temperature: 0.7,
          },
        });

        const reply = response.text || 'Desculpe, não consegui formular uma resposta no momento.';
        console.log('\n\x1b[32m🩺 Dra. Sofia:\x1b[0m\n' + reply);

        conversationHistory.push({
          role: 'model',
          parts: [{ text: reply }],
        });
      } catch (err: any) {
        // Fallback caso ocorra rate limit ou erro de rede
        console.warn('\x1b[31m[Aviso]:\x1b[0m Tentando resposta rápida via modelo alternativo...');
        try {
          const fallbackRes = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: conversationHistory,
            config: {
              systemInstruction: { parts: [{ text: systemInstruction }] },
            },
          });
          const reply = fallbackRes.text || 'Sem resposta disponível.';
          console.log('\n\x1b[32m🩺 Dra. Sofia:\x1b[0m\n' + reply);
          conversationHistory.push({ role: 'model', parts: [{ text: reply }] });
        } catch (e: any) {
          console.error('\x1b[31mErro na comunicação com a IA:\x1b[0m', e.message);
        }
      }

      promptUser();
    });
  };

  promptUser();
}

startAdvisor();
