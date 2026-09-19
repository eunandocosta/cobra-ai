const ementasService = require('./ementas.service');

class EmentasController {
  async processSyllabus(req, res) {
    try {
      const { text, rawText, ementa } = req.body || {};
      const targetText = text || rawText || ementa || '';

      if (!targetText || targetText.trim().length < 15) {
        return res.status(400).json({ error: 'Texto da ementa ausente ou insuficiente.' });
      }

      console.log(`🤖 [Backend] Enviando ementa ao Gemini (${process.env.MODEL_BALANCED || 'gemini-3.5-flash'})...`);
      const result = await ementasService.parseAndHarmonizeSyllabus(targetText);

      return res.json({
        success: true,
        metadata: result.metadata,
        curriculum: result.curriculum,
        engine: 'gemini-server',
        model: process.env.MODEL_BALANCED || 'gemini-3.5-flash'
      });
    } catch (err) {
      console.error('❌ [Backend] Erro ao processar ementa no Gemini:', err.message);
      return res.status(500).json({ error: 'Erro ao processar ementa com IA', details: err.message });
    }
  }

  async classifyMaterial(req, res) {
    try {
      const { content, materialName, curriculum, targetSemester } = req.body || {};
      const classification = await ementasService.classifyMaterialSemantically(content, materialName, curriculum, targetSemester);
      return res.json({
        success: true,
        engine: 'gemini-server',
        model: process.env.MODEL_BALANCED || 'gemini-3.5-flash',
        ...classification
      });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao classificar material', details: err.message });
    }
  }

  async getCurriculum(req, res) {
    try {
      const data = await ementasService.getCurriculum();
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao carregar grade', details: err.message });
    }
  }

  async getSubject(req, res) {
    try {
      const subjectId = req.params.subjectId;
      const details = await ementasService.getSubjectDetails(subjectId);
      return res.json(details);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar matéria', details: err.message });
    }
  }

  orderMaterials(req, res) {
    try {
      const { materials } = req.body || {};
      const ordered = ementasService.orderMaterialsByPedagogicalFlow(materials || []);
      return res.json({ success: true, count: ordered.length, materials: ordered });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao ordenar', details: err.message });
    }
  }

  allocate(req, res) {
    try {
      const { materialName, targetSubject, existingMaterials } = req.body || {};
      const result = ementasService.allocateMaterial(materialName, targetSubject, existingMaterials || []);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao alocar', details: err.message });
    }
  }
}

module.exports = new EmentasController();
