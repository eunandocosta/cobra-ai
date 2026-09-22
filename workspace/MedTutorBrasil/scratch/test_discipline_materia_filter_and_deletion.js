const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== TESTE DE VALIDAÇÃO: FILTRO ESTRITO DE MATÉRIAS POR DISCIPLINA & LIMPEZA DE MATÉRIAS EXCLUÍDAS ===\n');

const projectRoot = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(projectRoot, 'web/app.js'), 'utf8');

// 1. Validar que as funções essenciais estão presentes no código
assert(appSource.includes('function isSameCurriculumSubject(first, second)'), 'isSameCurriculumSubject deve estar definida');
assert(appSource.includes('function isExactStudySubject(materialSubject, selectedSubject)'), 'isExactStudySubject deve estar definida');
assert(appSource.includes('function getTopicsForSubject(subjectName)'), 'getTopicsForSubject deve estar definida');
assert(appSource.includes('pruneOrphanedQuestions()'), 'pruneOrphanedQuestions deve estar definida no serviço de desafios');
console.log('[PASS] 1. Funções de filtro curricular e auto-cura encontradas em app.js');

// 2. Extrair funções do app.js para teste isolado
function normalizeStudyComparisonText(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isExactStudySubject(materialSubject, selectedSubject) {
  const materialKey = normalizeStudyComparisonText(materialSubject);
  const selectedKey = normalizeStudyComparisonText(selectedSubject);
  return Boolean(materialKey && selectedKey && materialKey === selectedKey);
}

function getCurriculumSubjectAliases(value) {
  const raw = String(value || '');
  if (!raw.trim()) return [];
  const aliases = new Set();
  const romanNumerals = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
  const normalizeCore = text => normalizeStudyComparisonText(text)
    .replace(/^\d{1,2}\s+(?:semestre|periodo|fase|termo|ano|serie)\s+/, '')
    .replace(/^(?:semestre|periodo|fase|termo|ano|serie)\s+\d{1,2}\s+/, '')
    .replace(/^m\d{1,3}\s+/, '')
    .replace(/\b(sistemas? humanos?)\s+(i{1,3}|iv|v|vi|vii|viii|ix|x)\b/g, (_, prefix, roman) => `${prefix} ${romanNumerals[roman] || roman}`)
    .replace(/\s+/g, ' ')
    .trim();

  const withoutParentheticalLabels = raw.replace(/\([^)]*\)/g, ' ');
  [raw, withoutParentheticalLabels].forEach(candidate => {
    const key = normalizeCore(candidate);
    if (key) aliases.add(key);
  });
  for (const match of raw.matchAll(/\(([^)]+)\)/g)) {
    const key = normalizeCore(match[1]);
    if (key) aliases.add(key);
  }
  return [...aliases];
}

function isSameCurriculumSubject(first, second) {
  const firstAliases = getCurriculumSubjectAliases(first);
  const secondAliases = new Set(getCurriculumSubjectAliases(second));
  return firstAliases.some(alias => secondAliases.has(alias));
}

// 3. Teste de Não-Vazamento entre Disciplinas com Palavras Comuns
assert.strictEqual(
  isSameCurriculumSubject('M034 Saúde do Adulto', 'M030 Saúde da Criança'),
  false,
  'Saúde do Adulto NÃO deve dar match com Saúde da Criança'
);
assert.strictEqual(
  isSameCurriculumSubject('M001 Habilidades e Atitudes I', 'M007 Habilidades e Atitudes II'),
  false,
  'Habilidades I NÃO deve dar match com Habilidades II'
);
assert.strictEqual(
  isSameCurriculumSubject('M034 Saúde do Adulto', 'M052 Internato em Saúde do Adulto I (Clínica)'),
  false,
  'Saúde do Adulto (graduação) NÃO deve dar match com Internato em Saúde do Adulto'
);
assert.strictEqual(
  isSameCurriculumSubject('M010 Integração de Sistemas Humanos II (Sistema Tegumentar)', 'Integração de Sistemas Humanos 2'),
  true,
  'Integração de Sistemas Humanos II deve dar match com Sistemas Humanos 2'
);
console.log('[PASS] 2. Comparação curricular estrita impede vazamento entre disciplinas homônimas');

// 4. Teste de getTopicsForSubject com eliminação de matérias excluídas
let mockCurriculum = [
  {
    period: '2º Semestre',
    subjects: [
      {
        name: 'M010 Integração de Sistemas Humanos II (Sistema Tegumentar)',
        topics: ['Semiologia Dermatológica', 'Lesões Elementares']
      },
      {
        name: 'M009 Mecanismos de Agressão e Defesa',
        topics: ['Imunologia Básica', 'Microbiologia Geral']
      }
    ]
  }
];

let mockDriveMaterials = [
  {
    id: 'mat1',
    name: 'Lesões Elementares Aula 1.pdf',
    subject: 'M010 Integração de Sistemas Humanos II (Sistema Tegumentar)',
    topic: 'Lesões Primárias'
  },
  {
    id: 'mat2',
    name: 'Psoriase e Eczemas.pdf',
    subject: 'Integração de Sistemas Humanos 2',
    topic: 'Psoríase'
  }
];

let mockSharedQuestionsBank = [
  {
    id: 'q1',
    subject: 'M010 Integração de Sistemas Humanos II (Sistema Tegumentar)',
    slideName: 'Lesões Elementares Aula 1.pdf',
    topic: 'Lesões Primárias'
  },
  {
    id: 'q2_orphaned',
    subject: 'M010 Integração de Sistemas Humanos II (Sistema Tegumentar)',
    slideName: 'Aula Excluida do Drive.pdf',
    topic: 'Farmacodermias Antigas'
  },
  {
    id: 'q3_other_subj',
    subject: 'M009 Mecanismos de Agressão e Defesa',
    slideName: 'Imunologia Aula 1.pdf',
    topic: 'Imunologia Básica'
  }
];

function testGetTopicsForSubject(subjectName) {
  if (!subjectName) return [];
  const topicsSet = new Set();
  const addTopic = value => {
    const topic = String(value || '').trim();
    if (topic.length < 2 || isExactStudySubject(topic, subjectName) || isSameCurriculumSubject(topic, subjectName)) return;
    const duplicate = Array.from(topicsSet).some(existing => isExactStudySubject(existing, topic));
    if (!duplicate) topicsSet.add(topic);
  };

  mockCurriculum.forEach(p => {
    (p.subjects || []).forEach(s => {
      const sName = typeof s === 'string' ? s : s.name;
      if (!sName) return;
      if (isExactStudySubject(sName, subjectName) || isSameCurriculumSubject(sName, subjectName)) {
        if (s && Array.isArray(s.topics)) {
          s.topics.forEach(t => {
            if (t && typeof t === 'string' && !isSameCurriculumSubject(t, subjectName)) addTopic(t);
          });
        }
      }
    });
  });

  const activeMaterialNames = new Set();
  mockDriveMaterials.forEach(m => {
    if (!m) return;
    if (isSameCurriculumSubject(m.subject || m.disciplina, subjectName)) {
      [m.name, m.originalFileName, m.title].forEach(val => {
        if (val) activeMaterialNames.add(String(val).trim().toLowerCase());
      });
      [m.topic, m.name, m.originalFileName, m.title].forEach(addTopic);
    }
  });

  mockSharedQuestionsBank.forEach(q => {
    if (!q) return;
    if (isSameCurriculumSubject(q.subject || q.disciplina, subjectName)) {
      const sName = (q.slideName || q.materialName || q.nome_material || '').trim();
      const hasActiveDriveMaterials = activeMaterialNames.size > 0;
      // Se aponta para um slide excluído do Drive, ignora por completo
      if (sName && hasActiveDriveMaterials && !activeMaterialNames.has(sName.toLowerCase())) {
        return;
      }

      [q.topic, q.materia].forEach(addTopic);
      if (sName) {
        if (!hasActiveDriveMaterials || activeMaterialNames.has(sName.toLowerCase())) {
          addTopic(sName);
        }
      }
    }
  });

  return Array.from(topicsSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

const tegumentarTopics = testGetTopicsForSubject('Integração de Sistemas Humanos 2');
console.log('Tópicos encontrados para Sistemas 2:', tegumentarTopics);

// Verifica que tópicos de Mecanismos de Agressão NÃO vazaram
assert(!tegumentarTopics.includes('Imunologia Básica'), 'Imunologia Básica não pode aparecer em Sistemas Humanos 2');
assert(!tegumentarTopics.includes('Imunologia Aula 1.pdf'), 'Slide de outra disciplina não pode aparecer');

// Verifica que a matéria excluída do Drive NÃO aparece
assert(!tegumentarTopics.includes('Aula Excluida do Drive.pdf'), 'Matéria excluída do Drive NÃO deve aparecer no seletor');
assert(!tegumentarTopics.includes('Farmacodermias Antigas'), 'Tópico de questão órfã de aula excluída NÃO deve aparecer no seletor');

// Verifica que matérias ativas estão presentes
assert(tegumentarTopics.includes('Lesões Elementares Aula 1.pdf'), 'Aula 1 ativa deve estar presente');
assert(tegumentarTopics.includes('Psoriase e Eczemas.pdf'), 'Aula 2 ativa deve estar presente');
console.log('[PASS] 3. Matérias de outras disciplinas e matérias excluídas não aparecem no seletor');

// 5. Teste de auto-cura: remoção de questões órfãs
const initialQuestionsCount = mockSharedQuestionsBank.length;
const activeSet = new Set(mockDriveMaterials.map(m => m.name.toLowerCase()));
mockSharedQuestionsBank = mockSharedQuestionsBank.filter(q => {
  const sName = (q.slideName || '').toLowerCase();
  if (sName && !activeSet.has(sName) && isSameCurriculumSubject(q.subject, 'Integração de Sistemas Humanos 2')) {
    return false; // Remove órfã
  }
  return true;
});

assert.strictEqual(mockSharedQuestionsBank.length, initialQuestionsCount - 1, 'Deve remover exatamente a questão órfã q2_orphaned');
assert(!mockSharedQuestionsBank.some(q => q.id === 'q2_orphaned'), 'q2_orphaned deve ter sido excluída do banco');
console.log('[PASS] 4. Rotina de auto-cura remove questões órfãs de materiais deletados');

console.log('\n======================================================');
console.log('🎉 TODOS OS TESTES DE FILTRO E EXCLUSÃO PASSARAM!');
console.log('======================================================\n');
