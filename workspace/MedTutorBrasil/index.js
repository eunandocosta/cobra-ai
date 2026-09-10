// 1. Carregamento precoce de variáveis de ambiente (.env)
try {
  require('dotenv').config();
} catch (e) {
  if (typeof process.loadEnvFile === 'function') {
    try { process.loadEnvFile(); } catch (_) {}
  }
}

const path = require('path');
const express = require('./src/shared/express');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares Globais
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'web')));

// Montagem dos Módulos de Domínio (Monolito Modular Estrito)
app.use('/api/auth', require('./src/modules/auth/auth.routes'));
app.use('/api/ementas', require('./src/modules/ementas/ementas.routes'));
app.use('/api/relatorios', require('./src/modules/relatorios/relatorios.routes'));
app.use('/api/quizzes', require('./src/modules/quizzes/quizzes.routes'));
app.use('/api/chat', require('./src/modules/chat/chat.routes'));
app.use('/api/drive', require('./src/modules/drive/drive.routes'));
app.use('/api/imagens', require('./src/modules/imagens/imagens.routes'));

// Health Check do Sistema
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', architecture: 'modular-monolith', version: '2.0.0' });
});

// Configurações do Sistema para o Frontend
app.get('/api/config', (req, res) => {
  res.json({
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY || ''
  });
});

// Inicialização do Servidor HTTP
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 MedTutor Brasil (Modular Monolith) ativo na porta ${PORT}`);
  });
}

module.exports = app;
