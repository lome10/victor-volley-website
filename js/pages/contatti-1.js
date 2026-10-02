/* Victor Volley — script della pagina contatti.html (1), estratto dall'HTML per la Content-Security-Policy. */
(function(){
  var form = document.getElementById('contactForm');
  if(!form) return;
  var val = function(id){ return document.getElementById(id).value.trim(); };

  VVForm.attach(form, {
    success: document.getElementById('contactFormSuccess'),
    error: document.getElementById('contactFormError'),
    payload: function(){
      return {
        access_key: 'c7fbab29-7da0-4cef-ade0-7ae64a201e97',
        subject: val('c-oggetto'),
        from_name: val('c-nome'),
        nome: val('c-nome'),
        email: val('c-email'),
        oggetto: val('c-oggetto'),
        messaggio: val('c-messaggio')
      };
    }
  });
})();
