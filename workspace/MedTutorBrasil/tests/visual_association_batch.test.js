require('dotenv').config();
const assert = require('assert');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const imagensService = require('../src/modules/imagens/imagens.service');

(async () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalGetModel = GoogleGenerativeAI.prototype.getGenerativeModel;
  try {
    process.env.GEMINI_API_KEY = 'test-api-key';
    GoogleGenerativeAI.prototype.getGenerativeModel = function ({ model }) {
      return {
        generateContent: async () => ({ response: { text: () => JSON.stringify({
          items: [
            { index: 1, page: 12, isVisualStudyMaterial: true, title: 'Questão de anatomia', transcription: 'Qual nervo emerge dorsalmente? A) Troclear', visibleStructures: ['Tronco encefálico'], association: 'O enunciado e a alternativa estão legíveis.', caution: '', studyQuestion: 'Qual nervo emerge dorsalmente?' },
            { index: 2, page: 13, isVisualStudyMaterial: false, title: 'Página sem conteúdo', transcription: '', visibleStructures: [], association: '', caution: 'Página ilegível.', studyQuestion: '' }
          ]
        }) } })
      };
    };

    const result = await imagensService.analyzeVisualAssociationBatch({
      fileName: 'Aula visual',
      subject: 'Neuroanatomia',
      images: [
        { image: { mimeType: 'image/jpeg', data: 'aGVsbG8=' }, page: 12 },
        { image: { mimeType: 'image/jpeg', data: 'd29ybGQ=' }, page: 13 }
      ]
    });
    assert.strictEqual(result.associations.length, 2);
    assert.strictEqual(result.associations[0].analyzed, true);
    assert.match(result.associations[0].transcription, /nervo emerge dorsalmente/);
    assert.strictEqual(result.associations[1].page, 13);
    assert.strictEqual(result.associations[1].isVisualStudyMaterial, false);

    await assert.rejects(
      imagensService.analyzeVisualAssociationBatch({ images: new Array(5).fill({ image: { mimeType: 'image/jpeg', data: 'aGVsbG8=' } }) }),
      /1 a 4 páginas/
    );
    console.log('  [PASS] Lote visual transcreve texto de quiz e retorna status por página na ordem original');
    console.log('  [PASS] Tamanho máximo do lote é validado antes de chamar Gemini');
  } finally {
    GoogleGenerativeAI.prototype.getGenerativeModel = originalGetModel;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
