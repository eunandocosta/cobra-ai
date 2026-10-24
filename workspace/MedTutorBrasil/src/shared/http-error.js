// Mensagens de erro seguras para o cliente (MedTutor Brasil)
//
// Só repassa ao navegador a mensagem de erros lançados intencionalmente pelos
// serviços (com statusCode, como validações e falhas de IA já tratadas). Falhas
// inesperadas (SDKs, Firestore, variáveis de ambiente ausentes) ficam apenas no
// log do servidor, para não expor detalhes internos.
function clientErrorMessage(err) {
  if (err && err.statusCode && err.message) return err.message;
  console.error('❌ [HTTP] Erro interno ocultado do cliente:', err);
  return undefined;
}

module.exports = { clientErrorMessage };
