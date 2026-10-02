/* Victor Volley — script della pagina contatti.html (1), estratto dall'HTML per la Content-Security-Policy. */
(function(){
  /* Mappa: parte solo dopo il consenso (Google imposta cookie propri) */
  var mapEl = document.getElementById('mapGate');
  if(mapEl && window.VVConsent){
    VVConsent.gate(mapEl,
      '<iframe src="https://maps.google.com/maps?q=39.9654525,18.1160189&z=17&hl=it&output=embed" class="map-embed" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Palazzetto ARKÉ Melissano"></iframe>',
      { provider: 'Google Maps', link: 'https://www.google.com/maps?q=39.9654525,18.1160189' });
  }

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
        messaggio: val('c-messaggio'),
        consenso_privacy: 'sì'
      };
    }
  });
})();
