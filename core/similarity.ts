/**
 * MedTutor Brasil - Algoritmo Matemático de Detecção de Redundância (Sem IA)
 * 
 * Utiliza Tokenização, Remoção de Stopwords em Português e Cálculo Combinado de:
 * 1. Coeficiente de Similaridade de Jaccard (conjuntos de tokens/bigramas)
 * 2. Similaridade de Cossenos sobre vetores de frequência de termos (TF)
 * 
 * Vantagens:
 * - Custo R$ 0,00 (não consome cota nem tokens do Gemini API)
 * - Latência instantânea (< 5 milissegundos)
 * - Determinístico e independente de conexão à internet
 */

export interface TextRedundancyResult {
  isRedundant: boolean;
  score: number; // 0.0 a 1.0 (ex: 0.72 = 72% similar)
  percentage: number; // 0 a 100
  matchedItemId?: string;
  matchedText?: string;
  explanation: string;
}

export interface ExistingItem {
  id: string;
  text: string;
  subject?: string;
}

// Stopwords essenciais da língua portuguesa e conectivos médicos
const PT_STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas',
  'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
  'por', 'pelo', 'pela', 'pelos', 'pelas', 'para', 'pra', 'pro',
  'com', 'sem', 'sob', 'sobre', 'entre', 'ate', 'contra',
  'e', 'ou', 'mas', 'porem', 'contudo', 'todavia', 'que', 'se',
  'como', 'quando', 'onde', 'porque', 'porquê', 'qual', 'quais',
  'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas',
  'aquele', 'aquela', 'aqueles', 'aquelas', 'isto', 'isso', 'aquilo',
  'seu', 'sua', 'seus', 'suas', 'meu', 'minha', 'meus', 'minhas',
  'ele', 'ela', 'eles', 'elas', 'nos', 'vos', 'lhe', 'lhes',
  'ser', 'estar', 'ter', 'haver', 'fazer', 'ir', 'dar', 'ver',
  'foi', 'era', 'sao', 'sendo', 'sido', 'tem', 'tinha', 'ha',
  'paciente', 'quadro', 'caso'
]);

/**
 * Normaliza o texto removendo acentos, pontuação e convertendo para minúsculas.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos/acentos
    .replace(/[^a-z0-9\s]/g, ' ') // substitui pontuação por espaço
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai tokens significativos (palavras-chave) filtrando stopwords.
 */
export function extractKeywords(text: string): string[] {
  const normalized = normalizeText(text);
  const words = normalized.split(' ');
  return words.filter(word => word.length > 2 && !PT_STOPWORDS.has(word));
}

/**
 * Cria n-gramas de palavras para capturar sinônimos e variações morfológicas.
 */
export function generateBigrams(words: string[]): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]}_${words[i + 1]}`);
  }
  return bigrams;
}

/**
 * Calcula a similaridade de Jaccard entre dois conjuntos de tokens.
 */
export function calculateJaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  
  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount++;
    }
  }

  const unionCount = new Set([...tokensA, ...tokensB]).size;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * Calcula a similaridade de cossenos baseada na frequência de termos (TF).
 */
export function calculateCosineSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const freqA: Record<string, number> = {};
  const freqB: Record<string, number> = {};
  const vocabulary = new Set<string>();

  for (const token of tokensA) {
    freqA[token] = (freqA[token] || 0) + 1;
    vocabulary.add(token);
  }

  for (const token of tokensB) {
    freqB[token] = (freqB[token] || 0) + 1;
    vocabulary.add(token);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const term of vocabulary) {
    const valA = freqA[term] || 0;
    const valB = freqB[term] || 0;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Calcula a similaridade combinada (Cossenos 50% + Jaccard de Palavras 25% + Jaccard de Bigramas 25%)
 */
export function calculateCombinedSimilarity(text1: string, text2: string): number {
  const kw1 = extractKeywords(text1);
  const kw2 = extractKeywords(text2);

  if (kw1.length === 0 || kw2.length === 0) {
    const norm1 = normalizeText(text1);
    const norm2 = normalizeText(text2);
    if (norm1 === norm2 && norm1.length > 0) return 1.0;
    return 0.0;
  }

  const cosSim = calculateCosineSimilarity(kw1, kw2);
  const jaccardWords = calculateJaccardSimilarity(kw1, kw2);
  
  const bigrams1 = Array.from(generateBigrams(kw1));
  const bigrams2 = Array.from(generateBigrams(kw2));
  const jaccardBigrams = bigrams1.length > 0 && bigrams2.length > 0 
    ? calculateJaccardSimilarity(bigrams1, bigrams2) 
    : jaccardWords;

  const combined = (cosSim * 0.50) + (jaccardWords * 0.25) + (jaccardBigrams * 0.25);
  return Math.min(Math.max(combined, 0.0), 1.0);
}

/**
 * Avalia se um novo item é redundante em relação à base existente.
 * Limiar padrão configurado para 50% (0.50).
 */
export function detectRedundancy(
  candidateText: string,
  existingItems: ExistingItem[],
  threshold: number = 0.50
): TextRedundancyResult {
  let highestScore = 0;
  let matchedItem: ExistingItem | undefined;

  for (const item of existingItems) {
    const score = calculateCombinedSimilarity(candidateText, item.text);
    if (score > highestScore) {
      highestScore = score;
      matchedItem = item;
    }
  }

  const percentage = Math.round(highestScore * 100);
  const isRedundant = highestScore >= threshold;

  return {
    isRedundant,
    score: highestScore,
    percentage,
    matchedItemId: matchedItem?.id,
    matchedText: matchedItem?.text,
    explanation: isRedundant
      ? `Similaridade de ${percentage}% detectada com item existente ("${matchedItem?.text.slice(0, 60)}...").`
      : `Item exclusivo (${percentage}% de similaridade com a base, abaixo do limiar de ${Math.round(threshold * 100)}%).`
  };
}
