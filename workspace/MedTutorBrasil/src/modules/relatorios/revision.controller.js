'use strict';

const revisionService = require('./revision.service');

class RevisionController {
  async generate(req, res) {
    try {
      const payload = req.body || {};
      if (typeof payload.sourceText !== 'string' || payload.sourceText.trim().length < 80) {
        return res.status(400).json({ error: 'Texto-base insuficiente.', details: 'Cole um texto ou selecione um TXT/PDF com pelo menos 80 caracteres extraídos.' });
      }
      const review = await revisionService.generate(payload);
      return res.json(review);
    } catch (error) {
      const status = Number(error?.status);
      console.error('❌ [RevisionController] Falha ao gerar revisão:', error?.message || error);
      return res.status(status >= 400 && status < 500 ? status : 500).json({
        error: 'Não foi possível gerar a revisão.',
        details: error?.message || 'Erro inesperado no motor de revisão.'
      });
    }
  }
}

module.exports = new RevisionController();
