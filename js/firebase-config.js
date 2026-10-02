/* Victor Volley — Firebase initialisation
   Esposto come window.db (Firestore) e window.auth (Authentication)
*/
(function () {
  var config = {
    apiKey:            'AIzaSyAEwljngFef_1WGZBdQ-SAqAvLwyXGxjmk',
    authDomain:        'victor-volley.firebaseapp.com',
    projectId:         'victor-volley',
    storageBucket:     'victor-volley.firebasestorage.app',
    messagingSenderId: '567031992105',
    appId:             '1:567031992105:web:9248ce4a69ed2bff413138'
  };
  firebase.initializeApp(config);
  window.db   = firebase.firestore();
  /* L'SDK di autenticazione è caricato solo da admin e area atleti: sulle altre pagine non esiste. */
  if (typeof firebase.auth === 'function') window.auth = firebase.auth();
})();
