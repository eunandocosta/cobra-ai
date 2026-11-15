'use strict';

const VISUAL_LOCATOR_PATTERN = /\b(?:figura|fig\.?|imagem|prancha|tabela|quadro|diagrama|esquema|slide|p[aá]gina)\s*(?:(?:n[º°o.]?\s*)?\d+|abaixo|acima|anterior|seguinte|a seguir|anexa?|do material)\b/i;
const VISUAL_PREPOSITION_PATTERN = /\b(?:n[oa]|em|conforme|segundo)\s+(?:a|o)?\s*(?:figura|fig\.?|imagem|prancha|diagrama|esquema|slide|p[aá]gina)\b/i;
const hasVisualLocator = value => VISUAL_LOCATOR_PATTERN.test(String(value || '')) || VISUAL_PREPOSITION_PATTERN.test(String(value || ''));

// Enunciados que dependem de uma imagem do próprio material (figura, prancha,
// slide ou "representação virtual" extraída do arquivo) não se sustentam sozinhos
// no cartão. "Imagem" no singular fica de fora de propósito: é usada em casos
// clínicos ("achado na imagem de tomografia") que descrevem o exame no próprio texto.
const MATERIAL_IMAGE_NOUN = '(?:imagens|figuras|representa[çc][aã]o(?:es)?|pranchas?|diagramas?|esquemas?|slides|ilustra[çc][aã](?:o|oes|ões)|fotos)';
const MATERIAL_IMAGE_PATTERNS = [
  // "imagens extraídas do material", "figuras enviadas", "pranchas do slide"
  new RegExp(`\\b${MATERIAL_IMAGE_NOUN}\\s+(?:\\S+\\s+){0,4}?(?:extra[ií]d[oa]s?|do material|do slide|da aula|do arquivo|enviad[oa]s?|originais?)\\b`, 'i'),
  // "visualizadas na representação", "observadas nas figuras", "mostradas no diagrama"
  new RegExp(`\\b(?:visualizad|identificad|observad|mostrad|apresentad|representad|exibid|localizad|indicad)[oa]s?\\s+(?:na|no|nas|nos|em)\\s+(?:representa[çc][aã]o|figura|prancha|diagrama|esquema|slide|ilustra[çc][aã]o)s?\\b`, 'i'),
  // "na representação virtual", "nas imagens do material"
  new RegExp(`\\b(?:na|no|nas|nos)\\s+(?:representa[çc][aã]o|${MATERIAL_IMAGE_NOUN})\\s+(?:virtual|do material|extra[ií]d[oa]s?)\\b`, 'i')
];
const dependsOnMaterialImage = value => MATERIAL_IMAGE_PATTERNS.some(pattern => pattern.test(String(value || '')));

/**
 * Remove referências editoriais sem vínculo garantido com o recurso exibido
 * junto da questão. Devolve null quando a retirada deixa o enunciado incompleto.
 */
function removeUnsupportedVisualLocator(stem) {
  let clean = String(stem || '').replace(/\s+/g, ' ').trim();
  if (dependsOnMaterialImage(clean)) return null;
  if (!hasVisualLocator(clean)) return clean;

  const resource = '(?:figura|fig\\.?|imagem|prancha|tabela|quadro|diagrama|esquema|slide|p[aá]gina)';
  const suffixPatterns = [
    new RegExp(`\\s*,?\\s*(?:(?:[ée]|est[aá]|foi|foram|s[aã]o)\\s+)?(?:evidenciad[oa]s?|mostrad[oa]s?|representad[oa]s?|ilustrad[oa]s?|identificad[oa]s?|indicad[oa]s?|observad[oa]s?|apontad[oa]s?)\\s+(?:n[oa]|em|pel[oa])\\s+${resource}\\s*(?:n[º°o.]?\\s*)?\\d*[^?]*\\??\\s*$`, 'i'),
    new RegExp(`\\s*,?\\s*(?:conforme|segundo|de acordo com)\\s+(?:a|o)?\\s*${resource}\\s*(?:n[º°o.]\\s*)?\\d*[^?]*\\??\\s*$`, 'i'),
    new RegExp(`\\s+(?:n[oa]|em|pel[oa])\\s+${resource}\\s*(?:n[º°o.]\\s*)?\\d*[^?]*\\??\\s*$`, 'i')
  ];

  for (const pattern of suffixPatterns) {
    const candidate = clean.replace(pattern, '').replace(/[\s,;:–—-]+$/g, '').trim();
    const stillDependsOnVisual = /\b(?:apresentad[oa]s?|mostrad[oa]s?|representad[oa]s?|ilustrad[oa]s?|identificad[oa]s?|indicad[oa]s?|observad[oa]s?|apontad[oa]s?|visualizad[oa]s?|localizad[oa]s?|exibid[oa]s?|aparece[mn]?|compare(?:\s+as?)?|qual(?:\s+estrutura)?|quais(?:\s+estruturas)?|estrutura[s]?|componentes?)\s*$/i.test(candidate);
    if (candidate !== clean && candidate.length >= 18 && !hasVisualLocator(candidate) && !stillDependsOnVisual) {
      return `${candidate.replace(/[?.!]+$/g, '').trim()}?`;
    }
  }

  return null;
}

module.exports = { removeUnsupportedVisualLocator, hasVisualLocator, dependsOnMaterialImage };
