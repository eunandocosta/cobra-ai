#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const { getFirebaseAuth, getFirebaseFirestore } = require('../../src/shared/firebase-admin');

const EXPECTED_PROJECT_ID = 'cobra-ai-6549d';
const TARGET_COLLECTIONS = Object.freeze([
  'materiais_estudo',
  'historico_chats',
  'grade_curricular',
  'banco_questoes'
]);
const EXECUTE = process.argv.includes('--execute');
const CONFIRMATION = '--confirm=RESET_ALL_STUDY_DATA';

function countFromSnapshot(snapshot) {
  return Number(snapshot.data()?.count || 0);
}

async function countCollection(db, collectionName) {
  const aggregate = await db.collectionGroup(collectionName).count().get();
  return countFromSnapshot(aggregate);
}

async function listAccountIds(db, auth) {
  const ids = new Set();
  const profileSnapshot = await db.collection('users').get();
  profileSnapshot.docs.forEach(doc => ids.add(doc.id));

  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    page.users.forEach(user => ids.add(user.uid));
    pageToken = page.pageToken;
  } while (pageToken);

  return [...ids];
}

async function getPreview(db) {
  const accountIds = await listAccountIds(db, getFirebaseAuth());
  const totals = { accounts: accountIds.length };
  for (const collectionName of TARGET_COLLECTIONS) {
    totals[collectionName] = await countCollection(db, collectionName);
  }
  totals.materialChunks = await countCollection(db, 'conteudo_chunks');
  return totals;
}

async function deleteCollectionTree(db, collectionRef) {
  const snapshot = await collectionRef.get();
  for (const doc of snapshot.docs) {
    await db.recursiveDelete(doc.ref);
  }
  return snapshot.size;
}

async function run() {
  if (EXECUTE && !process.argv.includes(CONFIRMATION)) {
    throw new Error(`Para executar, passe também ${CONFIRMATION}.`);
  }
  const configuredProjectId = String(process.env.FIREBASE_PROJECT_ID || EXPECTED_PROJECT_ID).trim();
  if (configuredProjectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`Projeto Firebase inesperado (${configuredProjectId}); esperado ${EXPECTED_PROJECT_ID}.`);
  }

  const db = getFirebaseFirestore();
  const preview = await getPreview(db);
  console.log(JSON.stringify({ mode: EXECUTE ? 'EXECUTE' : 'DRY_RUN', preview }, null, 2));

  if (!EXECUTE) {
    console.log('Prévia concluída. Nenhum documento foi alterado.');
    console.log(`Para executar conscientemente: node scripts/admin/reset-study-data.js --execute ${CONFIRMATION}`);
    return;
  }

  const accountIds = await listAccountIds(db, getFirebaseAuth());
  const resetVersion = new Date().toISOString();

  // O marcador fica separado do documento de perfil. Clientes atualizados o
  // usam para descartar caches locais sem tocar no perfil ou perfil didático.
  for (let start = 0; start < accountIds.length; start += 400) {
    const batch = db.batch();
    accountIds.slice(start, start + 400).forEach(uid => {
      batch.set(db.collection('study_data_reset_markers').doc(uid), {
        version: resetVersion,
        updatedAt: resetVersion
      }, { merge: true });
    });
    await batch.commit();
  }

  const deleted = Object.fromEntries(TARGET_COLLECTIONS.map(name => [name, 0]));
  for (const uid of accountIds) {
    const userDoc = db.collection('users').doc(uid);
    for (const collectionName of TARGET_COLLECTIONS) {
      const collectionRef = userDoc.collection(collectionName);
      deleted[collectionName] += await deleteCollectionTree(db, collectionRef);
    }
  }

  const remaining = {};
  for (const collectionName of TARGET_COLLECTIONS) {
    remaining[collectionName] = await countCollection(db, collectionName);
  }
  remaining.materialChunks = await countCollection(db, 'conteudo_chunks');
  console.log(JSON.stringify({
    status: Object.values(remaining).every(count => count === 0) ? 'success' : 'incomplete',
    resetVersion,
    deleted,
    remaining,
    preserved: ['users/{uid} profile/auth data', 'users/{uid}/perfis_didaticos', 'Supabase Storage assets', 'other collections']
  }, null, 2));

  if (Object.values(remaining).some(count => count !== 0)) {
    process.exitCode = 2;
  }
}

run().catch(error => {
  console.error(JSON.stringify({ status: 'error', code: error.code || error.name, message: error.message }, null, 2));
  process.exitCode = 1;
});
