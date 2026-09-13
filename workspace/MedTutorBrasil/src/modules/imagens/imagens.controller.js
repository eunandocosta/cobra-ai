// src/modules/imagens/imagens.controller.js
// Controlador HTTP do Domínio de Imagens Médicas (MedTutor Brasil)

const imagensService = require('./imagens.service');

class ImagensController {
  async search(req, res) {
    try {
      const { query, subject, isReport } = req.body || {};
      if (!query || !query.trim()) {
        return res.status(400).json({ error: 'Parâmetro query é obrigatório.' });
      }

      const result = await imagensService.getCuratedMedicalImage(query, subject, !!isReport);
      return res.json(result);
    } catch (err) {
      console.error('❌ [ImagensController] Erro na busca de imagem:', err);
      return res.status(500).json({ error: 'Erro ao buscar imagem médica', details: err.message });
    }
  }

  async curate(req, res) {
    try {
      const { candidates, query, subject } = req.body || {};
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return res.status(400).json({ error: 'Array de candidatos é obrigatório.' });
      }

      const curated = await imagensService.verifyAndCurateCandidates(candidates, query || '', subject || '');
      return res.json({ success: !!curated, image: curated });
    } catch (err) {
      console.error('❌ [ImagensController] Erro na curadoria de imagem:', err);
      return res.status(500).json({ error: 'Erro na curadoria pericial', details: err.message });
    }
  }

  async analyzeVisualAssociation(req, res) {
    try {
      const { image, fileName, subject, page } = req.body || {};
      if (!image || typeof image.data !== 'string' || typeof image.mimeType !== 'string') {
        return res.status(400).json({ error: 'Imagem visual válida é obrigatória.' });
      }
      const association = await imagensService.analyzeVisualAssociation({ image, fileName, subject, page });
      return res.json({ success: true, association });
    } catch (err) {
      console.error('❌ [ImagensController] Erro na associação visual:', err);
      return res.status(500).json({ error: 'Erro ao interpretar o material visual', details: err.message });
    }
  }
}

module.exports = new ImagensController();
