/* Victor Volley — modulo «Richiedi informazioni» della pagina sponsor.html. */
(function () {
  var form = document.getElementById('sponsorForm');
  if (!form || !window.VVForm) return;
  var val = function (id) { return document.getElementById(id).value.trim(); };

  VVForm.attach(form, {
    success: document.getElementById('sponsorFormSuccess'),
    error: document.getElementById('sponsorFormError'),
    payload: function () {
      var azienda = val('sp-azienda'), referente = val('sp-referente');
      return {
        access_key: 'c7fbab29-7da0-4cef-ade0-7ae64a201e97',
        subject: 'Richiesta partnership: ' + azienda,
        from_name: referente + ' (' + azienda + ')',
        modulo: 'Diventa partner',
        azienda: azienda,
        referente: referente,
        email: val('sp-email'),
        telefono: val('sp-telefono') || 'non indicato',
        livello: document.getElementById('sp-livello').value,
        messaggio: val('sp-messaggio') || '—',
        consenso_privacy: 'sì'
      };
    }
  });
})();
