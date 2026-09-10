// Controlador HTTP do Domínio Auth (MedTutor Brasil)
const authService = require('./auth.service');

class AuthController {
  async session(req, res) {
    try {
      const sessionData = await authService.createSession(req.body);
      return res.json(sessionData);
    } catch (err) {
      return res.status(500).json({ error: 'Falha na autenticação', details: err.message });
    }
  }

  async profile(req, res) {
    try {
      const uid = req.query.uid || req.body?.uid;
      const profileData = await authService.getProfile(uid);
      return res.json(profileData);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao carregar perfil', details: err.message });
    }
  }

  async preferences(req, res) {
    try {
      const uid = req.body?.uid;
      const result = await authService.updatePreferences(uid, req.body?.preferencias || req.body);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao salvar preferências', details: err.message });
    }
  }

  logout(req, res) {
    return res.json({ success: true, message: 'Sessão encerrada com sucesso' });
  }
}

module.exports = new AuthController();
