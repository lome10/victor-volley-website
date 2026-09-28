const functions = require('firebase-functions');
const admin     = require('firebase-admin');

admin.initializeApp();

/**
 * Cambia la password di un atleta.
 *
 * Chiamabile solo da un DIRIGENTE (esiste dirigenti/{uid}) e solo su un ATLETA
 * (esiste atleti/{uid}): non si può quindi usare per cambiare la password di
 * un dirigente né di un account qualsiasi. Le registrazioni via client sono
 * aperte, per cui "essere loggati" o "non essere un atleta" non è una prova
 * di autorizzazione.
 */
exports.setAthletePassword = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Non autenticato.');
  }

  const db = admin.firestore();

  const callerDoc = await db.collection('dirigenti').doc(context.auth.uid).get();
  if (!callerDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Accesso negato.');
  }

  const uid      = data && data.uid;
  const password = data && data.password;

  if (!uid || typeof uid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'UID mancante.');
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new functions.https.HttpsError(
      'invalid-argument', 'La password deve avere almeno 6 caratteri.'
    );
  }

  const targetDoc = await db.collection('atleti').doc(uid).get();
  if (!targetDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Atleta non trovato.');
  }

  await admin.auth().updateUser(uid, { password });
  return { success: true };
});
