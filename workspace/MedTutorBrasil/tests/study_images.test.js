const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

// Extrai do web/app.js as funções de PPTX e de imagens e as executa isoladas.
const appSource = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
function extractFunction(name) {
  const match = appSource.match(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  if (!match) throw new Error(`Função ${name} não encontrada em web/app.js`);
  let depth = 0;
  for (let i = appSource.indexOf('{', match.index); i < appSource.length; i++) {
    if (appSource[i] === '{') depth++;
    else if (appSource[i] === '}' && --depth === 0) return appSource.slice(match.index, i + 1);
  }
  throw new Error(`Função ${name} sem fechamento`);
}
const mimeLine = appSource.match(/const PPTX_IMAGE_MIME = \{[^}]+\};/)[0];

class FakeFileReader {
  readAsDataURL(blob) {
    blob.arrayBuffer().then(buffer => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onload();
    });
  }
}
const sandbox = vm.createContext({
  TextDecoder, DecompressionStream, Response, Blob, Uint8Array, DataView, Number, Math, Promise, console,
  FileReader: FakeFileReader,
  getImageDimensions: async () => ({ width: 800, height: 600 }),
  chatDriveMaterials: [],
  sharedQuestionsBank: [],
  savedCount: 0
});
vm.runInContext(`${mimeLine}
  function saveSharedQuestionsBank() { savedCount++; }
  ${['readZipEntries', 'inflateZipEntry', 'mapPptxMediaToSlides', 'extractPptxEmbeddedImages', 'extractTextFromPptx',
    'firestoreSafeValue', 'questionImageForCloud', 'supabaseSignedImagePath', 'getStudySupportImage',
    'normalizeVisualMatchText', 'getVisualKeywords', 'attachMaterialImagesToStudyItems'].map(extractFunction).join('\n')}
  var studyImageRelinkTried = new Set();
  ${extractFunction('relinkMissingStudyImages')}`, sandbox);

// Monta um ZIP mínimo (formato do PPTX) com entradas compactadas (deflate).
function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  files.forEach(({ name, data, store }) => {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(data);
    const body = store ? raw : zlib.deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(store ? 0 : 8, 10);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, body);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + body.length;
  });
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, end]);
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const slideXml = text => `<p:sld><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sld>`;
const pptx = buildZip([
  { name: 'ppt/slides/slide1.xml', data: slideXml('Ciclo cardíaco &amp; sístole') },
  { name: 'ppt/slides/slide2.xml', data: slideXml('ECG com supra de ST') },
  { name: 'ppt/slides/slide3.xml', data: '<p:sld><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Derivações</a:t></a:r><a:r><a:t> e paredes</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:txBody><a:p><a:r><a:t>Parede inferior: DII, DIII e aVF.</a:t></a:r></a:p><a:p><a:r><a:t>Parede anterior: V1 a V4.</a:t></a:r></a:p></p:txBody></p:sp></p:sld>' },
  { name: 'ppt/slides/_rels/slide2.xml.rels', data: '<Relationships><Relationship Id="rId2" Target="../media/image1.png"/><Relationship Id="rId3" Target="../media/image2.emf"/></Relationships>' },
  { name: 'ppt/media/image1.png', data: png, store: true },
  { name: 'ppt/media/image2.emf', data: Buffer.from('EMF-binario') }
]);
const fakeFile = { name: 'aula.pptx', arrayBuffer: async () => pptx.buffer.slice(pptx.byteOffset, pptx.byteOffset + pptx.byteLength) };
const withTimeout = (promise, label) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} travou`)), 3000))]);

(async () => {
  console.log('🧪 Iniciando testes de imagens e PowerPoint...');

  const text = await withTimeout(sandbox.extractTextFromPptx(fakeFile), 'Leitura do texto do PPTX');
  assert.strictEqual(text, '## Slide 1\n\nCiclo cardíaco & sístole\n\n## Slide 2\n\nECG com supra de ST\n\n## Slide 3: Derivações e paredes\n\nParede inferior: DII, DIII e aVF.\nParede anterior: V1 a V4.');
  console.log('  [PASS] Texto do PPTX compactado é lido sem travar, com título do slide e um parágrafo por linha');

  const images = await withTimeout(sandbox.extractPptxEmbeddedImages(fakeFile), 'Leitura das imagens do PPTX');
  assert.strictEqual(images.length, 1, 'o PNG deve ser extraído');
  assert.strictEqual(images[0].page, 2, 'a imagem deve saber de qual slide veio');
  assert(images[0].src.startsWith('data:image/png;base64,'), 'a imagem vira data URL PNG');
  assert.strictEqual(images.unsupportedCount, 1, 'o EMF deve ser contado como formato não suportado');
  console.log('  [PASS] Imagens do PPTX saem com o número do slide e EMF é contado');

  assert.deepStrictEqual(JSON.parse(JSON.stringify(await sandbox.extractPptxEmbeddedImages({ name: 'antigo.ppt', arrayBuffer: async () => new ArrayBuffer(64) }))), [], 'arquivo que não é ZIP não trava nem quebra');
  console.log('  [PASS] Arquivo que não é ZIP devolve lista vazia');

  assert.strictEqual(sandbox.firestoreSafeValue({ a: [[1, 2]] }), undefined, 'arrays aninhados não podem ir ao Firestore');
  assert.strictEqual(sandbox.firestoreSafeValue('x'.repeat(50), 20), undefined, 'campos grandes demais ficam de fora');
  assert.strictEqual(JSON.stringify(sandbox.firestoreSafeValue({ a: [1, { b: [2] }], c: undefined })), '{"a":[1,{"b":[2]}]}');
  assert.strictEqual(sandbox.questionImageForCloud({ imageUrl: 'data:image/png;base64,AAA' }), undefined, 'Base64 nunca vai para a nuvem');
  const cloudImage = sandbox.questionImageForCloud({ imageUrl: 'https://x.supabase.co/storage/v1/object/sign/aulas/u/1.jpg?token=t', page: '3', title: 'ECG' });
  assert.strictEqual(cloudImage.page, 3);
  assert.strictEqual(cloudImage.thumbnailUrl, cloudImage.imageUrl);
  console.log('  [PASS] Imagem e explicação da questão vão para a nuvem em formato aceito');

  assert.strictEqual(sandbox.supabaseSignedImagePath('https://x.supabase.co/storage/v1/object/sign/aulas/usuarios/u%201/fig.jpg?token=abc', 'aulas'), 'usuarios/u 1/fig.jpg');
  assert.strictEqual(sandbox.supabaseSignedImagePath('https://upload.wikimedia.org/a.png', 'aulas'), null);
  console.log('  [PASS] Caminho da figura é recuperado do link assinado para renovação');

  sandbox.chatDriveMaterials = [{ id: 'mat-1', name: 'Aula renomeada', originalFileName: 'aula.pptx', subject: 'Cardio', clinicalImages: [
    { page: 1, imageUrl: 'https://img/1.jpg', title: 'Slide 1' },
    { page: 2, imageUrl: 'https://img/2.jpg', title: 'Slide 2' }
  ] }];
  vm.runInContext('chatDriveMaterials = this.chatDriveMaterials', sandbox);
  const questions = [
    { id: 'q1', sourceMaterialId: 'mat-1', slideName: 'Nome antigo', pagina_origem_pdf: 2, question: 'Observe o ECG.' },
    { id: 'q2', slideName: 'aula.pptx', pagina_origem_pdf: 1, question: 'Qual fase do ciclo?' },
    { id: 'q3', slideName: 'Outro material', question: 'Sem figura.' }
  ];
  assert.strictEqual(sandbox.relinkMissingStudyImages(questions), 2);
  assert.strictEqual(questions[0].medicalImage.imageUrl, 'https://img/2.jpg', 'material renomeado é achado pelo id');
  assert.strictEqual(questions[1].medicalImage.imageUrl, 'https://img/1.jpg', 'material é achado pelo nome original do arquivo');
  assert.strictEqual(questions[2].medicalImage, undefined, 'questão de outro material não recebe figura aleatória');
  assert.strictEqual(sandbox.savedCount, 1, 'as figuras religadas são salvas');
  assert.strictEqual(sandbox.relinkMissingStudyImages(questions), 0, 'não repete a tentativa enquanto as imagens não mudam');
  console.log('  [PASS] Questões existentes recuperam a figura do material na hora de exibir');

  assert(!/visualAssociations\[index\]/.test(appSource), 'uma imagem não pode herdar a descrição de outra página');
  assert(appSource.includes('onerror="handleStudyImageError(this)"'), 'figura quebrada deve ter tratamento');
  assert(!/await writer\.write\(/.test(appSource), 'nenhum DecompressionStream pode aguardar a escrita antes da leitura');
  console.log('  [PASS] Descrições não se trocam, imagem quebrada tem aviso e não há leitura que trave');
  console.log('🎉 Testes de imagens e PowerPoint concluídos!\n');
})().catch(error => { console.error(error); process.exit(1); });
