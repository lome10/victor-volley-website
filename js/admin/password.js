/* Victor Volley — Admin: generatore di password.
   Ogni pulsante con data-genpwd="idCampo[,idCampo2]" riempie quei campi con una password casuale, la mostra e la copia
   negli appunti. 14 caratteri da un generatore crittografico (crypto.getRandomValues, senza distorsione), con almeno
   2 minuscole, 2 maiuscole, 2 cifre e 2 simboli; niente caratteri ambigui (0/O, 1/l/I) né apici o barre che danno
   problemi quando si detta o si incolla. Supera il minimo di 10 caratteri richiesto dal sito e le indicazioni
   correnti (NIST SP 800-63B, AgID): lunga e casuale, senza regole di composizione da ricordare. Espone Admin.password. */
(function () {
  'use strict';

  var MINUSCOLE = 'abcdefghijkmnpqrstuvwxyz';
  var MAIUSCOLE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  var CIFRE     = '23456789';
  var SIMBOLI   = '!#$%&*+-=?@';
  var LUNGHEZZA = 14;

  /* intero uniforme in [0, n): scarta i valori che farebbero sbilanciare il resto */
  function _rnd(n) {
    var a = new Uint32Array(1), limite = Math.floor(4294967296 / n) * n;
    do { crypto.getRandomValues(a); } while (a[0] >= limite);
    return a[0] % n;
  }
  function _pesca(s) { return s.charAt(_rnd(s.length)); }

  function genera(len) {
    len = Math.max(len || LUNGHEZZA, 12);
    var tutti = MINUSCOLE + MAIUSCOLE + CIFRE + SIMBOLI;
    var out = [_pesca(MINUSCOLE), _pesca(MINUSCOLE), _pesca(MAIUSCOLE), _pesca(MAIUSCOLE),
               _pesca(CIFRE), _pesca(CIFRE), _pesca(SIMBOLI), _pesca(SIMBOLI)];
    while (out.length < len) out.push(_pesca(tutti));
    for (var i = out.length - 1; i > 0; i--) {          /* mescola (Fisher-Yates) così le categorie non stanno sempre in testa */
      var j = _rnd(i + 1), t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out.join('');
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-genpwd]');
    if (!b) return;
    var pwd = genera();
    b.getAttribute('data-genpwd').split(',').forEach(function (id) {
      var el = document.getElementById(id.trim());
      if (el) { el.value = pwd; el.type = 'text'; }      /* in chiaro: chi la genera deve poterla leggere e comunicare */
    });
    var etichetta = b.getAttribute('data-label') || b.textContent;
    b.setAttribute('data-label', etichetta);
    var fatto = function (copiata) {
      b.textContent = copiata ? 'Generata e copiata ✓' : 'Generata ✓ (copiala a mano)';
      setTimeout(function () { b.textContent = b.getAttribute('data-label'); }, 3000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pwd).then(function () { fatto(true); }, function () { fatto(false); });
    } else {
      fatto(false);
    }
  });

  window.Admin.password = { genera: genera };
})();
