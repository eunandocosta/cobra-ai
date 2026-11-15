'use strict';

const { hasVisualLocator, dependsOnMaterialImage } = require('./visual-reference.guard');

// Enunciado genérico ("Quais os neurotransmissores envolvidos?") não diz de qual
// estrutura, circuito ou processo fala. Em vez de descartar a pergunta, pedimos à
// IA uma versão autossuficiente, mantendo alternativas e gabarito.
function isVagueQuestionStem(stem) {
  const clean = String(stem || '').replace(/\s+/g, ' ').trim();
  const words = clean ? clean.split(' ').length : 0;
  if (words < 8) return true;
  return words < 12 && /^(?:quais?|qual|o que|como|onde)\b[^?]{0,60}\b(?:envolvid|relacionad|associad|participa|atua)[oa]?s?\b[^?]*\?$/i.test(clean);
}

// Só aceita a reescrita se ela continuar válida, não ficar vaga, não voltar a
// depender de imagem e de fato mudar o enunciado.
function isAcceptableRewrite(original, rewritten, validators) {
  const clean = String(rewritten || '').replace(/\s+/g, ' ').trim();
  if (!clean || clean === String(original || '').trim()) return false;
  if (isVagueQuestionStem(clean)) return false;
  if (dependsOnMaterialImage(clean) || hasVisualLocator(clean)) return false;
  return validators.isValidStem(clean) && !validators.hasUnresolvedContext(clean);
}

// A resposta pode vir com cercas de markdown ou vírgula sobrando; trata os dois casos.
function parseRewriteJson(text) {
  const raw = String(text || '').replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
  try {
    return JSON.parse(raw);
  } catch (error) {
    return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1'));
  }
}

async function rewriteVagueQuestionStems(questions, deps) {
  const { genAI, materialText, subject, modelOptions, generateWithFallback, validators } = deps;
  const list = Array.isArray(questions) ? questions : [];
  const targets = list
    .map((question, index) => ({ index, question: String(question?.pergunta || '') }))
    .filter(target => target.question && isVagueQuestionStem(target.question));
  if (!targets.length || !genAI) return list;

  const prompt = `Reescreva SOMENTE os enunciados abaixo para que fiquem autossuficientes: cada um deve nomear a estrutura, o circuito ou o processo a que se refere, com base no texto-base.
Mantenha a mesma pergunta (mesmo conceito e mesma resposta correta). Não altere alternativas nem gabarito. Não cite figura, imagem, slide, tabela, página ou representação.
Disciplina: ${String(subject || '').slice(0, 200)}

ENUNCIADOS A REESCREVER:
${targets.map(target => `[${target.index}] ${target.question}`).join('\n')}

TEXTO-BASE (trecho):
${String(materialText || '').slice(0, 12000)}

Retorne JSON: {"reescritas":[{"indice":0,"pergunta":"enunciado completo terminado em ?"}]}`;

  try {
    const generated = await generateWithFallback(genAI, modelOptions, prompt);
    const parsed = parseRewriteJson(generated.result.response.text());
    const next = list.slice();
    let accepted = 0;
    const rejected = [];
    const items = Array.isArray(parsed?.reescritas) ? parsed.reescritas : [];
    items.forEach(item => {
      const index = Number(item?.indice);
      const target = targets.find(entry => entry.index === index);
      const rewritten = String(item?.pergunta || '').replace(/\s+/g, ' ').trim();
      if (target && isAcceptableRewrite(target.question, rewritten, validators)) {
        next[index] = { ...next[index], pergunta: rewritten };
        accepted++;
      } else {
        rejected.push({ indice: item?.indice, motivo: target ? 'reescrita_nao_aceita' : 'indice_desconhecido' });
      }
    });
    console.info(`[Quiz Engine] Enunciados genéricos: ${targets.length} identificado(s), ${accepted} reescrito(s).`, rejected.length ? rejected : '');
    if (!items.length) console.warn('[Quiz Engine] A IA não devolveu reescritas para os enunciados genéricos.');
    return next;
  } catch (error) {
    console.warn('[Quiz Engine] Reescrita de enunciados genéricos indisponível; mantidos como estão.', error?.message || error);
    return list;
  }
}

module.exports = { isVagueQuestionStem, isAcceptableRewrite, parseRewriteJson, rewriteVagueQuestionStems };
