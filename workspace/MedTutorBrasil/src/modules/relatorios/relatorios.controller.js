// Controlador HTTP do Domínio Relatórios (MedTutor Brasil)
const relatoriosService = require('./relatorios.service');

class RelatoriosController {
  async generate(req, res) {
    try {
      const payload = req.body || {};
      const report = await relatoriosService.generateReport(payload);
      return res.json(report);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao gerar relatório', details: err.message });
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
