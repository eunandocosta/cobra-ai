'use strict';

function isTransientAiError(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;

  const code = String(error?.code || error?.cause?.code || '').toUpperCase();
  if (['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) return true;

  const message = String(error?.message || '').toLowerCase();
  return /temporarily unavailable|service unavailable|rate.?limit|too many requests|resource exhausted|overloaded|deadline exceeded|socket hang up|fetch failed|network error/.test(message);
}

function retryDelayMs(error, retryIndex, baseDelayMs = 1000, maxDelayMs = 8000) {
  const retryAfter = Number(error?.headers?.['retry-after'] || error?.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(maxDelayMs, retryAfter * 1000);
  const exponential = Math.min(maxDelayMs, baseDelayMs * (2 ** retryIndex));
  return Math.round(exponential * (0.8 + Math.random() * 0.4));
}

async function withTransientAiRetry(operation, {
  label = 'etapa da revisão',
  maxRetries = 2,
  baseDelayMs = 1000,
  maxDelayMs = 8000,
  onRetry = () => {},
  wait = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries || !isTransientAiError(error)) throw error;
      const delay = retryDelayMs(error, attempt, baseDelayMs, maxDelayMs);
      onRetry({ label, attempt: attempt + 1, delay, error });
      await wait(delay);
    }
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const input = Array.from(items || []);
  const results = new Array(input.length);
  if (!input.length) return results;

  const workerCount = Math.max(1, Math.min(input.length, Math.floor(Number(concurrency) || 1)));
  let cursor = 0;
  let firstError = null;
  const workers = Array.from({ length: workerCount }, async () => {
    while (!firstError) {
      const index = cursor;
      cursor += 1;
      if (index >= input.length) return;
      try {
        results[index] = await mapper(input[index], index);
      } catch (error) {
        firstError ||= error;
      }
    }
  });

  // Aguarda também tarefas já iniciadas antes de propagar erro; assim não
  // ficam chamadas de IA órfãs continuando a consumir cota após a falha.
  await Promise.all(workers);
  if (firstError) throw firstError;
  return results;
}

module.exports = { isTransientAiError, withTransientAiRetry, mapWithConcurrency };
