const functions = require('firebase-functions');
const admin     = require('firebase-admin');

admin.initializeApp();

/**
 * Cambia la password di un atleta.
 * Callable solo da utenti autenticati che NON sono atleti
 * (cioè non hanno un doc in /atleti/{uid}).
 */
exports.setAthletePassword = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Non autenticato.');
  }

  /* Verifica che il chiamante sia un admin (non in collezione atleti) */
  const callerDoc = await admin.firestore()
    .collection('atleti').doc(context.auth.uid).get();
  if (callerDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Accesso negato.');
  }

  const uid      = data.uid;
  const password = data.password;

  if (!uid || typeof uid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'UID mancante.');
  }
  if (!password || password.length < 6) {
    throw new functions.https.HttpsError(
      'invalid-argument', 'La password deve avere almeno 6 caratteri.'
    );
  }

  await admin.auth().updateUser(uid, { password });
  return { success: true };
});
