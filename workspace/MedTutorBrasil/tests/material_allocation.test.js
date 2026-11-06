const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Roda o classificador real do web/app.js com a grade canônica da Universo.
const appSource = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
function extract(name) {
  const match = appSource.match(new RegExp(`function\\s+${name}\\s*\\(`));
  if (!match) throw new Error(`Função ${name} não encontrada em web/app.js`);
  let depth = 0;
  for (let i = appSource.indexOf('{', match.index); i < appSource.length; i++) {
    if (appSource[i] === '{') depth++;
    else if (appSource[i] === '}' && --depth === 0) return appSource.slice(match.index, i + 1);
  }
  throw new Error(`Função ${name} sem fechamento`);
}
const declaration = name => {
  const start = appSource.search(new RegExp(`\\n\\s*(?:const|var|let) ${name} = `));
  const end = appSource.indexOf('];', start);
  return appSource.slice(start, end + 2).replace(/^\s*(?:const|let)\s/m, 'var ');
};
const functions = ['classifyMedicalDocumentSemantically', 'getOfficialCurriculumDisciplineList', 'matchPeriodSemester',
  'extractClinicalTopicFromContent', 'extractDiseaseFromFilename', 'getMaterialAllocationEvidence', 'normalizeCurriculumText',
  'scoreSubjectContentFit', 'curriculumTerms', 'hasCurriculumPhrase', 'stripCurriculumLoad', 'generateSmartMaterialTitle',
  'analyzeMedicalContentForTitle', 'refineAcademicMaterialTitle', 'resolveProcessedMaterialTitle', 'extractMaterialContentTitle', 'extractMaterialCoverTitle',
  'generateDescriptiveIndexForMaterial'];
const context = vm.createContext({ console, window: {}, currentStudySubject: '' });
vm.runInContext([declaration('CANONICAL_UNIVERSO_CURRICULUM'), declaration('MEDICAL_TOPIC_REGISTRY'),
  ...functions.map(extract), 'var universityCurriculum = CANONICAL_UNIVERSO_CURRICULUM;'].join('\n'), context);

console.log('🧪 Iniciando testes de alocação de material na grade...');
const classify = text => context.classifyMedicalDocumentSemantically(text, 'aula.pptx', null, null);
const cases = [
  ['infarto com "1 a 3 horas" no texto', '## Slide 1: Eletrocardiograma no infarto\n\nSupradesnivelamento do segmento ST em derivações contíguas.\nDosar troponina na admissão e repetir em 1 a 3 horas.', /M066 Eletrocardiograma|Cardiovascular|Cardiologia/],
  ['neonatologia com "minuto de vida"', '## Slide 1: Reanimação neonatal\n\nO recém-nascido com apneia recebe ventilação no primeiro minuto de vida.', /Neonatologia|Pediatria/],
  ['histologia da epiderme', '## Slide 1: Tecido epitelial\n\nHistologia do epitélio de revestimento e epitélio estratificado queratinizado da epiderme.', /Tegumentar|Histolog/],
  ['asma com "diagnóstico", "suspeita" e "utilizado"', '## Slide 1: Asma\n\nNa suspeita de asma, o broncodilatador utilizado é o salbutamol; espirometria confirma o diagnóstico.', /Respirat/],
  ['radiologia de tórax', '## Slide 1: Radiografia de tórax\n\nNa radiografia de tórax avalie a técnica; a tomografia detalha nódulos.', /Diagn[oó]stico por Imagem/],
  ['atenção primária', '## Slide 1: Estratégia Saúde da Família\n\nA atenção primária organiza o cuidado na UBS com equipes de ESF no SUS.', /Sa[uú]de da Fam[ií]lia/]
];
for (const [label, text, expected] of cases) {
  const result = classify(text);
  assert.match(result.fullName, expected, `${label}: foi para "${result.fullName}"`);
}
console.log('  [PASS] Seis aulas vão para disciplinas coerentes (sem "horas", "vida" ou "diagnóstico" decidirem)');

const infarct = classify(cases[0][1]);
assert.doesNotMatch(infarct.justification, /horas/, 'carga horária do nome da disciplina não é evidência');
assert.equal(context.stripCurriculumLoad('M051 Internato em Saúde da Criança I (Neonatologia) (48 horas na Atenção Básica)'), 'M051 Internato em Saúde da Criança I (Neonatologia)');
console.log('  [PASS] Carga horária e palavras administrativas ficam fora da pontuação');

const title = text => context.resolveProcessedMaterialTitle('aula_iam.pptx', text, '', '');
assert.equal(title('## Slide 1: Eletrocardiograma no infarto\n\nSupradesnivelamento do segmento ST.'), 'Eletrocardiograma no infarto', 'título vem do 1º slide, não do nome do arquivo');
assert.equal(title('## Slide 1: Introdução\n\nVisão geral.\n\n## Slide 2: Reanimação neonatal\n\nVentilação.'), 'Reanimação neonatal', 'pula títulos genéricos como "Introdução"');
assert.equal(context.resolveProcessedMaterialTitle('x.pdf', '## Slide 1: Tema do slide\n\nTexto.', '', '', 'Título sugerido pela IA'), 'Título sugerido pela IA', 'sugestão da IA continua tendo prioridade');
// Nome do arquivo nunca vira título quando o material diz o tema.
assert.equal(context.resolveProcessedMaterialTitle('AULA_7__INFLAMAC_A_O_2026_2.pdf', '## Página 1\n\nINFLAMAÇÃO\n\n## Página 2\n\nFases gerais.', '', '', ['AULA_7__INFLAMAC_A_O_2026_2', 'AULA_7__INFLAMAC_A_O_2026_2']), 'Inflamação', 'sugestão igual ao nome do arquivo é descartada e caixa-alta vira título');
assert.equal(context.resolveProcessedMaterialTitle('Aula 9.pdf', '## Página 1\n\nMEDICINA · SISTEMA TEGUMENTAR\nHipersensibilidades e\nautoimunidade na pele\nDo mastócito à quebra de tolerância\n01 / 24\n\n## Página 2\n\nConceito.', '', '', ['Aula 9']), 'Hipersensibilidades e autoimunidade na pele', 'capa: pula a chamada e junta o título quebrado');
assert.equal(context.resolveProcessedMaterialTitle('Aula 8.pdf', '## Página 1\n\nImunologia da pele\nA arquitetura celular.', '', '', ['', 'Aula 8', 'Imunologia cutânea']), 'Imunologia cutânea', 'a primeira sugestão válida vence');
assert.equal(context.resolveProcessedMaterialTitle('Cópia de Osso como órgão.pdf', '## Página 1\n\nOsso como órgão', '', '', ['Cópia de Osso como órgão']), 'Osso como órgão', 'sem alternativa, usa o título do material sem "Cópia de"');
console.log('  [PASS] Título do material vem do próprio conteúdo');
console.log('🎉 Testes de alocação de material concluídos!\n');
