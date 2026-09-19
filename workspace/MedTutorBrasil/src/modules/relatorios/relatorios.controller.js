// Controlador HTTP do Domínio Relatórios (MedTutor Brasil)
const relatoriosService = require('./relatorios.service');

class RelatoriosController {
  async generate(req, res) {
    try {
      const payload = req.body || {};
      if (typeof payload.content !== 'string' || payload.content.trim().length < 80) {
        return res.status(400).json({ error: 'Conteúdo textual insuficiente para gerar o relatório.', details: 'Envie content com ao menos 80 caracteres.' });
      }
      const report = await relatoriosService.generateReport(payload);
      return res.json(report);
    } catch (err) {
      const upstreamStatus = Number(err?.status || err?.statusCode || 0);
      const status = upstreamStatus >= 400 && upstreamStatus < 600 ? 502 : 500;
      const diagnostic = {
        provider: err?.provider || String(process.env.REPORT_AI_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'gemini')).toLowerCase(),
        model: err?.model || (process.env.OPENAI_REPORT_MODEL || process.env.MODEL_REASONING || 'não informado'),
        code: String(err?.code || err?.type || 'report-generation-failed'),
        upstreamStatus: upstreamStatus || null
      };
      console.error('❌ [RelatoriosController] Falha ao gerar relatório:', { ...diagnostic, message: err?.message });
      return res.status(status).json({
        error: 'Erro ao gerar relatório',
        details: err?.message || 'O provedor de IA não concluiu a geração.',
        ...diagnostic
      });
    }
  }

  async getById(req, res) {
    try {
      const report = await relatoriosService.getReportById(req.params.id);
      return res.json(report);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar relatório', details: err.message });
    }
  }

  async getByMaterial(req, res) {
    try {
      const list = await relatoriosService.getReportsByMaterial(req.params.materialId);
      return res.json({ count: list.length, reports: list });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar relatórios do material', details: err.message });
    }
  }

  exportPdf(req, res) {
    try {
      const { reportId } = req.body || {};
      const exportInfo = relatoriosService.preparePdfExport(reportId);
      return res.json(exportInfo);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao preparar exportação', details: err.message });
    }
  }
}

module.exports = new RelatoriosController();
