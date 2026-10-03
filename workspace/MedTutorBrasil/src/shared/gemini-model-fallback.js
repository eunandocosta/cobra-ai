'use strict';

const GENERAL_FLASH_MODELS = Object.freeze([
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash'
]);

const IMAGE_FLASH_MODELS = Object.freeze([
  'gemini-3.5-flash',
  'gemini-3.6-flash'
]);

function isModelUnavailable(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  return [404, 429, 500, 503].includes(status) || /model(?:s)?\/.+not found|model.+not found|not supported for generatecontent|unsupported model|resource exhausted|temporarily unavailable|overloaded/.test(message);
}

async function generateContentWithFallback(genAI, options, input, models = GENERAL_FLASH_MODELS, execute = (model, payload) => model.generateContent(payload)) {
  let lastError;
  const candidates = [...new Set((models || []).filter(Boolean))];
  for (let index = 0; index < candidates.length; index += 1) {
    const modelName = candidates[index];
    try {
      const model = genAI.getGenerativeModel({ ...options, model: modelName });
      return { result: await execute(model, input), modelName };
    } catch (error) {
      lastError = error;
      if (!isModelUnavailable(error) || index === candidates.length - 1) throw error;
      console.warn(`[Gemini] Modelo ${modelName} indisponível; tentando ${candidates[index + 1]}.`);
    }
  }
  throw lastError || new Error('Nenhum modelo Gemini Flash configurado.');
}

async function sendChatMessageWithFallback(genAI, options, history, message, models = GENERAL_FLASH_MODELS, execute = (chat, payload) => chat.sendMessage(payload)) {
  let lastError;
  const candidates = [...new Set((models || []).filter(Boolean))];
  for (let index = 0; index < candidates.length; index += 1) {
    const modelName = candidates[index];
    try {
      const model = genAI.getGenerativeModel({ ...options, model: modelName });
      const chat = model.startChat({ history });
      return { result: await execute(chat, message), modelName };
    } catch (error) {
      lastError = error;
      if (!isModelUnavailable(error) || index === candidates.length - 1) throw error;
      console.warn(`[Gemini] Modelo ${modelName} indisponível; tentando ${candidates[index + 1]}.`);
    }
  }
  throw lastError || new Error('Nenhum modelo Gemini Flash configurado.');
}

module.exports = { GENERAL_FLASH_MODELS, IMAGE_FLASH_MODELS, isModelUnavailable, generateContentWithFallback, sendChatMessageWithFallback };
