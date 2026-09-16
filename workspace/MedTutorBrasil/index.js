try {
  require('dotenv').config();
} catch (e) {
  if (typeof process.loadEnvFile === 'function') {
    try { process.loadEnvFile(); } catch (_) {}
  }
}

const fs = require('fs');
const path = require('path');
const express = require('./src/shared/express');
const { apiRateLimit, compression, staticCacheHeaders } = require('./src/shared/production.middleware');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(compression);
app.use(staticCacheHeaders);
app.use(apiRateLimit({ windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000), maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 120) }));
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || '2mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.REQUEST_BODY_LIMIT || '2mb' }));

// Servir JS minificado/ofuscado se disponível, com fallback para app.js
app.get('/app.min.js', (req, res) => {
  const minifiedPath = path.join(__dirname, 'web', 'app.min.js');
  if (fs.existsSync(minifiedPath)) {
    return res.sendFile(minifiedPath);
  }
  return res.sendFile(path.join(__dirname, 'web', 'app.js'));
});

app.use(express.static(path.join(__dirname, 'web')));

app.use('/api/auth', require('./src/modules/auth/auth.routes'));
app.use('/api/ementas', require('./src/modules/ementas/ementas.routes'));
app.use('/api/relatorios', require('./src/modules/relatorios/relatorios.routes'));
app.use('/api/quizzes', require('./src/modules/quizzes/quizzes.routes'));
app.use('/api/chat', require('./src/modules/chat/chat.routes'));
app.use('/api/drive', require('./src/modules/drive/drive.routes'));
app.use('/api/imagens', require('./src/modules/imagens/imagens.routes'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', architecture: 'modular-monolith', version: '2.0.0' });
});

app.get('/api/config', (req, res) => {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const supabasePublishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  res.json({
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    // A chave publicável é própria para o navegador. Chaves service_role e a
    // senha PostgreSQL nunca são retornadas por esta rota.
    supabaseStorage: supabaseUrl && supabasePublishableKey ? {
      url: supabaseUrl,
      publishableKey: supabasePublishableKey,
      bucket: String(process.env.SUPABASE_STORAGE_BUCKET || 'materiais-estudo').trim()
    } : null
  });
});

// O Firestore é acessado diretamente pelo navegador. Este endpoint espelha no
// terminal apenas metadados de falhas de sincronização — nunca o conteúdo médico.
app.post('/api/diagnostics/firebase-sync', (req, res) => {
  const body = req.body || {};
  const safe = {
    event: String(body.event || 'unknown').slice(0, 80),
    code: String(body.code || '').slice(0, 120),
    message: String(body.message || '').replace(/[\r\n]+/g, ' ').slice(0, 400),
    uid: String(body.uid || '').slice(0, 128),
    authenticatedUid: String(body.authenticatedUid || '').slice(0, 128),
    materials: Math.max(0, Math.min(Number(body.materials) || 0, 10_000)),
    contentChars: Math.max(0, Math.min(Number(body.contentChars) || 0, 100_000_000)),
    at: new Date().toISOString()
  };
  console.error('❌ [Firestore Sync]', safe);
  res.status(204).end();
});

// Metadados operacionais de upload: nunca recebe o texto, as imagens ou dados
// clínicos do estudante. Permite verificar o motor e o resultado no terminal.
app.post('/api/diagnostics/upload', (req, res) => {
  const body = req.body || {};
  const safe = {
    status: String(body.status || 'sucesso').slice(0, 32),
    arquivo: String(body.fileName || 'Material').replace(/[\r\n]+/g, ' ').slice(0, 240),
    motor: String(body.aiEngine || 'Não informado').replace(/[\r\n]+/g, ' ').slice(0, 160),
    caracteresLidos: Math.max(0, Math.min(Number(body.inputChars) || 0, 100_000_000)),
    caracteresGerados: Math.max(0, Math.min(Number(body.outputChars) || 0, 100_000_000)),
    imagensColetadas: Math.max(0, Math.min(Number(body.imagesCollected) || 0, 1000)),
    imagensPersistidas: Math.max(0, Math.min(Number(body.imagesPersisted) || 0, 1000)),
    armazenamento: String(body.storageStatus || 'não informado').replace(/[\r\n]+/g, ' ').slice(0, 180),
    at: new Date().toISOString()
  };
  const icon = safe.status === 'sucesso' ? '✅' : (safe.status === 'iniciando' ? '📥' : (safe.status === 'processando' ? '⏳' : (safe.status === 'texto_extraido' ? '📄' : '⚠️')));
  console.log(`${icon} [Upload MedTutor]`, safe);
  res.status(204).end();
});

function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`🚀 MedTutor Brasil (Modular Monolith) ativo na porta ${PORT}`);
  });
  Object.assign(server, { requestTimeout: Number(process.env.REQUEST_TIMEOUT_MS || 30_000), headersTimeout: Number(process.env.HEADERS_TIMEOUT_MS || 35_000), keepAliveTimeout: Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 5_000) });
  return server;
}

if (require.main === module) {
  startServer();
}

app.startServer = startServer;
module.exports = app;
