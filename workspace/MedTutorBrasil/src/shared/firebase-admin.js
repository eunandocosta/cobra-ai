const fs = require('fs');
const path = require('path');

let firebaseApp = null;

function configurationError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;

  const { getApps, initializeApp, cert } = require('firebase-admin/app');
  const defaultApp = getApps().find(app => app.name === '[DEFAULT]');
  if (defaultApp) {
    firebaseApp = defaultApp;
    return firebaseApp;
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || 'cobra-ai-6549d').trim();
  const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const credentialsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  let credential;

  if (serviceAccountJson) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (error) {
      throw configurationError('FIREBASE_SERVICE_ACCOUNT_JSON precisa conter um JSON válido.', 'firebase_service_account_invalid_json');
    }
    if (!serviceAccount || typeof serviceAccount !== 'object' || Array.isArray(serviceAccount) ||
        !serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
      throw configurationError('A conta de serviço não contém os campos obrigatórios.', 'firebase_service_account_fields_missing');
    }
    if (serviceAccount.project_id !== projectId) {
      throw configurationError('A conta de serviço configurada não pertence ao FIREBASE_PROJECT_ID informado.', 'firebase_service_account_project_mismatch');
    }
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    credential = cert(serviceAccount);
  } else if (credentialsPath) {
    const resolvedPath = path.resolve(credentialsPath);
    if (!fs.existsSync(resolvedPath)) {
      throw configurationError('O arquivo indicado por GOOGLE_APPLICATION_CREDENTIALS não foi encontrado.', 'firebase_credentials_file_not_found');
    }
    credential = cert(require(resolvedPath));
  } else {
    throw configurationError('Configure FIREBASE_SERVICE_ACCOUNT_JSON ou GOOGLE_APPLICATION_CREDENTIALS para ativar cupons.', 'firebase_admin_credentials_missing');
  }

  firebaseApp = initializeApp({ credential, projectId });
  return firebaseApp;
}

function getFirebaseAuth() {
  const { getAuth } = require('firebase-admin/auth');
  return getAuth(getFirebaseApp());
}

function getFirebaseFirestore() {
  const { getFirestore } = require('firebase-admin/firestore');
  return getFirestore(getFirebaseApp());
}

module.exports = { getFirebaseApp, getFirebaseAuth, getFirebaseFirestore };
