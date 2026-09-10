// Serviço de Negócio do Domínio Auth (MedTutor Brasil)
class AuthService {
  constructor() {
    this.defaultProfile = {
      uid: 'student_demo_01',
      nome: 'Estudante de Medicina',
      email: 'aluno@medicina.uf.br',
      faculdade: 'Faculdade de Medicina',
      periodo_atual: '4º Período',
      ciclo: 'Ciclo Clínico',
      meta_residencia: 'Clínica Médica / Neurologia'
    };

    this.defaultPreferences = {
      modoTDAH: true,
      checkpointsFrequentes: true,
      destaqueSintetico: true,
      questoesComentadasFinais: true,
      densidadeVisual: 'confortavel',
      temaPadrao: 'a4-paper',
      limiteMinutosSessao: 45
    };
  }

  async createSession(credentials = {}) {
    const { email, password, token } = credentials;
    return {
      authenticated: true,
      token: token || `medtutor_session_${Date.now()}`,
      user: {
        ...this.defaultProfile,
        email: email || this.defaultProfile.email
      }
    };
  }

  async getProfile(uid) {
    return {
      ...this.defaultProfile,
      uid: uid || this.defaultProfile.uid,
      preferencias: this.defaultPreferences
    };
  }

  async updatePreferences(uid, newPreferences = {}) {
    this.defaultPreferences = {
      ...this.defaultPreferences,
      ...newPreferences
    };
    return {
      success: true,
      preferencias: this.defaultPreferences
    };
  }
}

module.exports = new AuthService();
