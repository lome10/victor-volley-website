/* Victor Volley — pagina «Scegli la password» (link ricevuto per email dopo la creazione dell'account).
   Il codice sta nel frammento dell'indirizzo (#t=...): non viene mai mandato al server né nel Referer.
   La pagina lo verifica con /api/imposta-password, poi invia la nuova password con lo stesso codice. */
(function () {
  'use strict';

  var m = /[#&]t=([A-Za-z0-9_-]+)/.exec(location.hash);
  var token = m ? m[1] : '';
  var stato = document.getElementById('ipStato');
  var form  = document.getElementById('ipForm');
  var err   = document.getElementById('ipErr');
  var btn   = document.getElementById('ipBtn');

  function chiama(payload) {
    return fetch('/api/imposta-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Errore, riprova più tardi.');
        return data;
      });
    });
  }

  function nonValido(msg) {
    stato.textContent = msg || 'Questo link non è valido o è già stato usato. Chiedi alla società di inviartene uno nuovo.';
    stato.classList.remove('is-hidden');
    form.classList.add('is-hidden');
  }

  if (!token) { nonValido(); return; }

  chiama({ token: token, soloVerifica: true }).then(function (d) {
    document.getElementById('ipEmail').value = d.email || '';
    stato.classList.add('is-hidden');
    form.classList.remove('is-hidden');
    document.getElementById('ipPwd').focus();
  }, function (e) { nonValido(e.message); });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    err.textContent = '';
    var p1 = document.getElementById('ipPwd').value, p2 = document.getElementById('ipPwd2').value;
    if (p1.length < 10) { err.textContent = 'La password deve avere almeno 10 caratteri.'; return; }
    if (p1 !== p2) { err.textContent = 'Le due password non coincidono.'; return; }
    btn.disabled = true; btn.textContent = 'Salvataggio…';
    chiama({ token: token, password: p1 }).then(function () {
      form.classList.add('is-hidden');
      document.getElementById('ipFatto').classList.remove('is-hidden');
      if (history.replaceState) history.replaceState(null, '', location.pathname);   /* il link ormai è usato */
    }, function (e) {
      err.textContent = e.message;
      btn.disabled = false; btn.textContent = 'Salva la password';
    });
  });
})();
