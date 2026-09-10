// Controlador HTTP do Domínio Chat & MedCopilot (MedTutor Brasil)
const chatService = require('./chat.service');

class ChatController {
  async message(req, res) {
    try {
      const result = await chatService.processMessage(req.body || {});
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao processar mensagem', details: err.message });
    }
  }

  getSession(req, res) {
    try {
      const session = chatService.getSession(req.params.sessionId);
      return res.json(session);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar sessão', details: err.message });
    }
  }

  getEvidence(req, res) {
    try {
      const { topic, subject } = req.body || {};
      const evidence = chatService.getEvidenceUrls(topic || 'Medicina', subject || 'Clínica Médica');
      return res.json(evidence);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar evidências', details: err.message });
    }
  }
}

module.exports = new ChatController();
