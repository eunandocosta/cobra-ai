const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

// Ordem dos materiais pela data de criação gravada no arquivo enviado.
const appSource = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
function extract(name) {
  const match = appSource.match(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  if (!match) throw new Error(`Função ${name} não encontrada em web/app.js`);
  let depth = 0;
  for (let i = appSource.indexOf('{', match.index); i < appSource.length; i++) {
    if (appSource[i] === '{') depth++;
    else if (appSource[i] === '}' && --depth === 0) return appSource.slice(match.index, i + 1);
  }
  throw new Error(`Função ${name} sem fechamento`);
}
const context = vm.createContext({ console, TextDecoder, DecompressionStream, Response, Uint8Array, DataView, Date, Number });
vm.runInContext(['parsePdfDate', 'readSourceFileCreatedAt', 'readZipEntries', 'inflateZipEntry', 'materialUploadTimeFromId', 'materialChronologyTime'].map(extract).join('\n'), context);

const fakeFile = (name, content, lastModified = 0) => {
  const bytes = Buffer.from(content, 'latin1');
  return { name, size: bytes.length, lastModified, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
function zipWith(name, text) {
  const nameBytes = Buffer.from(name);
  const body = zlib.deflateRawSync(Buffer.from(text));
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(body.length, 20); central.writeUInt16LE(nameBytes.length, 28);
  const centralAll = Buffer.concat([central, nameBytes]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(centralAll.length, 12); end.writeUInt32LE(30 + nameBytes.length + body.length, 16);
  return Buffer.concat([local, nameBytes, body, centralAll, end]).toString('latin1');
}

(async () => {
  console.log('🧪 Iniciando testes da ordem cronológica dos materiais...');
  const pdf = await context.readSourceFileCreatedAt(fakeFile('Aula 8.pdf', "%PDF-1.7\n<</Author(Larissa)/CreationDate(D:20261022204508-03'00')>>"));
  assert.equal(pdf.createdAt, '2026-10-22T23:45:08.000Z');
  const xmp = await context.readSourceFileCreatedAt(fakeFile('a.pdf', '%PDF-1.7\n<xmp:CreateDate>2026-10-01T19:09:21-03:00</xmp:CreateDate>'));
  assert.equal(xmp.createdAt, '2026-10-01T22:09:21.000Z');
  const pptx = await context.readSourceFileCreatedAt(fakeFile('a.pptx', zipWith('docProps/core.xml', '<cp:coreProperties><dcterms:created xsi:type="dcterms:W3CDTF">2026-09-15T12:00:00Z</dcterms:created></cp:coreProperties>')));
  assert.equal(pptx.createdAt, '2026-09-15T12:00:00.000Z');
  const noMeta = await context.readSourceFileCreatedAt(fakeFile('a.pdf', '%PDF-1.7', Date.UTC(2026, 9, 5)));
  assert.equal(noMeta.source, 'data de modificação do arquivo');
  console.log('  [PASS] Data de criação lida do PDF (Info e XMP) e do PowerPoint, com recurso à data de modificação');

  const materials = [
    { name: 'Aula 9', sourceCreatedAt: '2026-10-29T23:08:15Z' },
    { name: 'Antigo sem metadado', id: `upload-mat-${Date.UTC(2026, 8, 1)}-abcde` },
    { name: 'ED I', data_criacao_arquivo: '2026-10-01T22:09:21Z' },
    { name: 'Aula 7', sourceCreatedAt: '2026-10-15T18:43:31Z' }
  ];
  const ordered = materials.slice().sort((a, b) => context.materialChronologyTime(a) - context.materialChronologyTime(b)).map(m => m.name);
  assert.deepEqual(ordered, ['Antigo sem metadado', 'ED I', 'Aula 7', 'Aula 9']);
  assert.match(extract('sortMaterialsInPedagogicalOrder'), /materialChronologyTime\(a\)[\s\S]*if \(ta && tb && ta !== tb\) return ta - tb;/, 'a matéria lista do mais antigo para o mais recente');
  assert.match(appSource, /data_criacao_arquivo: String\(material\.sourceCreatedAt/, 'a data vai para o Firestore');
  console.log('  [PASS] Materiais da matéria ficam do arquivo mais antigo para o mais recente');
  console.log('🎉 Testes da ordem cronológica concluídos!\n');
})().catch(error => { console.error(error); process.exit(1); });
