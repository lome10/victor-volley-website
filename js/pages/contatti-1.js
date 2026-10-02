/* Victor Volley — script della pagina contatti.html (1), estratto dall'HTML per la Content-Security-Policy. */
(function(){
  var form = document.getElementById('contactForm');
  var success = document.getElementById('contactFormSuccess');
  var errorBox = document.getElementById('contactFormError');
  var submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  if(!form) return;
  form.addEventListener('submit', function(e){
    e.preventDefault();
    errorBox.style.display = 'none';
    var nome    = document.getElementById('c-nome').value.trim();
    var email   = document.getElementById('c-email').value.trim();
    var oggetto = document.getElementById('c-oggetto').value.trim();
    var msg     = document.getElementById('c-messaggio').value.trim();
    if(!nome || !email || !oggetto || !msg){ alert('Compila tutti i campi obbligatori.'); return; }

    var payload = {
      access_key: 'c7fbab29-7da0-4cef-ade0-7ae64a201e97',
      subject: oggetto,
      from_name: nome,
      nome: nome,
      email: email,
      oggetto: oggetto,
      messaggio: msg
    };

    submitBtn.disabled = true;

    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function(res){ return res.json(); })
    .then(function(data){
      submitBtn.disabled = false;
      if(data.success){
        success.style.display = 'block';
        form.reset();
        success.scrollIntoView({behavior:'smooth'});
      } else {
        errorBox.style.display = 'block';
        errorBox.scrollIntoView({behavior:'smooth'});
      }
    })
    .catch(function(){
      submitBtn.disabled = false;
      errorBox.style.display = 'block';
      errorBox.scrollIntoView({behavior:'smooth'});
    });
  });
})();
