// src/modules/drive/drive.controller.js
const driveService = require('./drive.service');

class DriveController {
  async scan(req, res) {
    try {
      const folderIdOrUrl = req.query.id || req.query.url || req.body.id || req.body.url;
      if (!folderIdOrUrl) {
        return res.status(400).json({ error: 'Parâmetro "id" ou "url" do Google Drive é obrigatório.' });
      }

      const result = await driveService.scanFolder(folderIdOrUrl);
      return res.json(result);
    } catch (err) {
      console.error('❌ [DriveController] Erro ao varrer pasta do Drive:', err.message);
      return res.status(500).json({ error: 'Erro ao conectar com o Google Drive', details: err.message });
    }
  }

  async download(req, res) {
    try {
      const fileId = req.params.fileId || req.query.id;
      if (!fileId) {
        return res.status(400).json({ error: 'ID do arquivo é obrigatório.' });
      }

      const { buffer, contentType } = await driveService.downloadFile(fileId);
      res.setHeader('Content-Type', contentType);
      return res.send(buffer);
    } catch (err) {
      console.error('❌ [DriveController] Erro ao baixar arquivo:', err.message);
      return res.status(500).json({ error: 'Erro ao baixar arquivo do Drive', details: err.message });
    }
  }
}

module.exports = new DriveController();
