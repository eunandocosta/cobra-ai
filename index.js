// Entrypoint de hospedagem em nuvem (Render, Railway, Cloud Run)
// Inicializa o servidor Express do MedTutor Brasil e mantém a porta escutando.
import app from './workspace/MedTutorBrasil/index.js';

if (typeof app.startServer === 'function') {
  app.startServer();
} else if (typeof app.listen === 'function') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`🚀 MedTutor Brasil ativo na porta ${PORT}`);
  });
}
