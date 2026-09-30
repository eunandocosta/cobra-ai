'use strict';

const STOP_WORDS = new Set((
  'a ao aos aquela aquelas aquele aqueles aquilo as ate com como da das de dela delas dele deles depois do dos e ela elas ele eles em entre era essa essas esse esses esta estas este estes eu foi foram ha isso isto ja lhe lhes mais mas mesmo minha muito na nas nem no nos nossa nossas nosso nossos num numa o os ou para pela pelas pelo pelos por porque qual quando que quem se sem ser seu seus sua suas tambem te tem ter teu teus toda todas todo todos tua tuas um uma umas uns voce voces'
).split(/\s+/));

function normalizeTopicText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getTopicTerms(value) {
  return new Set(normalizeTopicText(value)
    .split(/\s+/)
    .filter(term => term.length >= 4 && !STOP_WORDS.has(term) && !/^\d+$/.test(term)));
}

/**
 * A source document is always retained. Other files are admitted only when
 * they share multiple specific concepts with the source (or a very high
 * proportion of a short source's concepts). Discipline membership alone is
 * deliberately not enough to qualify a file.
 */
function selectTopicallyRelevantMaterials(sourceText, materials = []) {
  const sourceTerms = getTopicTerms(sourceText);
  const shortSourceThreshold = sourceTerms.size < 12 ? 2 : 3;
  return (Array.isArray(materials) ? materials : []).map(material => {
    const materialText = String(material?.text || material?.content || '');
    const titleTerms = getTopicTerms(material?.name || material?.title || '');
    const textTerms = getTopicTerms(materialText);
    const matches = [...sourceTerms].filter(term => textTerms.has(term) || titleTerms.has(term));
    // Exige coocorrência dentro de um mesmo trecho: um material longo não é
    // considerado pertinente só por mencionar palavras dispersas ao acaso.
    const coherentMatches = materialText.split(/\n{1,}|(?<=[.!?;])\s+/)
      .map(paragraph => [...sourceTerms].filter(term => getTopicTerms(paragraph).has(term)).length)
      .reduce((max, count) => Math.max(max, count), 0);
    const coverage = sourceTerms.size ? matches.length / sourceTerms.size : 0;
    const requiredMatches = Math.min(shortSourceThreshold, sourceTerms.size);
    return {
      material,
      matches: matches.length,
      coherentMatches,
      coverage,
      relevant: sourceTerms.size >= 2 && matches.length >= requiredMatches &&
        (matches.length >= 3 || coverage >= 0.2) &&
        coherentMatches >= Math.min(2, sourceTerms.size)
    };
  });
}

module.exports = { normalizeTopicText, getTopicTerms, selectTopicallyRelevantMaterials };
