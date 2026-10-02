/* Victor Volley — script della pagina unisciti-a-noi.html (1), estratto dall'HTML per la Content-Security-Policy. */
(function(){
  var form = document.getElementById('uniscitiForm');
  if(!form) return;
  var val = function(id){ return document.getElementById(id).value.trim(); };

  VVForm.attach(form, {
    success: document.getElementById('formSuccess'),
    error: document.getElementById('formError'),
    payload: function(){
      var nome = val('nome'), cognome = val('cognome');
      return {
        access_key: 'c7fbab29-7da0-4cef-ade0-7ae64a201e97',
        subject: 'Richiesta informazioni: ' + nome + ' ' + cognome,
        from_name: nome + ' ' + cognome,
        nome: nome,
        cognome: cognome,
        email: val('email'),
        telefono: val('telefono') || 'non indicato',
        eta: val('eta'),
        categoria: document.getElementById('categoria').value,
        messaggio: val('messaggio') || '—',
        consenso_privacy: 'sì'
      };
    }
  });
})();
