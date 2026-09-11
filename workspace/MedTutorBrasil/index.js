try {
  require('dotenv').config();
} catch (e) {
  if (typeof process.loadEnvFile === 'function') {
    try { process.loadEnvFile(); } catch (_) {}
  }
}

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
  res.json({ geminiConfigured: !!process.env.GEMINI_API_KEY });
});

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`🚀 MedTutor Brasil (Modular Monolith) ativo na porta ${PORT}`);
  });
  Object.assign(server, { requestTimeout: Number(process.env.REQUEST_TIMEOUT_MS || 30_000), headersTimeout: Number(process.env.HEADERS_TIMEOUT_MS || 35_000), keepAliveTimeout: Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 5_000) });
}

module.exports = app;
