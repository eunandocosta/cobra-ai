const fs = require('fs');
const path = require('path');

let firebaseAdmin = null;

function getFirebaseAdmin() {
  if (firebaseAdmin) return firebaseAdmin;

  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const projectId = String(process.env.FIREBASE_PROJECT_ID || 'cobra-ai-6549d').trim();
    const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
    const credentialsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
    let credential;

    if (serviceAccountJson) {
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(serviceAccountJson);
      } catch (error) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON precisa conter um JSON válido.');
      }
      if (serviceAccount.project_id && serviceAccount.project_id !== projectId) {
        throw new Error('A conta de serviço configurada não pertence ao FIREBASE_PROJECT_ID informado.');
      }
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      credential = admin.credential.cert(serviceAccount);
    } else if (credentialsPath) {
      const resolvedPath = path.resolve(credentialsPath);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error('O arquivo indicado por GOOGLE_APPLICATION_CREDENTIALS não foi encontrado.');
      }
      credential = admin.credential.cert(require(resolvedPath));
    } else {
      throw new Error('Configure FIREBASE_SERVICE_ACCOUNT_JSON ou GOOGLE_APPLICATION_CREDENTIALS para ativar cupons.');
    }

    admin.initializeApp({ credential, projectId });
  }

  firebaseAdmin = admin;
  return firebaseAdmin;
}

module.exports = { getFirebaseAdmin };
