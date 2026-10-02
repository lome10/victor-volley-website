/* Victor Volley — script della pagina unisciti-a-noi.html (1), estratto dall'HTML per la Content-Security-Policy. */
(function(){
  var form = document.getElementById('uniscitiForm');
  var success = document.getElementById('formSuccess');
  var errorBox = document.getElementById('formError');
  var submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  if(!form) return;

  form.addEventListener('submit', function(e){
    e.preventDefault();
    errorBox.style.display = 'none';

    // Validazione base
    var nome     = document.getElementById('nome').value.trim();
    var cognome  = document.getElementById('cognome').value.trim();
    var email    = document.getElementById('email').value.trim();
    var eta      = document.getElementById('eta').value.trim();
    var categoria = document.getElementById('categoria').value;

    if(!nome || !cognome || !email || !eta || !categoria){
      alert('Compila tutti i campi obbligatori.');
      return;
    }

    var messaggio = document.getElementById('messaggio').value.trim();
    var telefono  = document.getElementById('telefono').value.trim();

    var payload = {
      access_key: 'c7fbab29-7da0-4cef-ade0-7ae64a201e97',
      subject: 'Richiesta informazioni: ' + nome + ' ' + cognome,
      from_name: nome + ' ' + cognome,
      nome: nome,
      cognome: cognome,
      email: email,
      telefono: telefono || 'non indicato',
      eta: eta,
      categoria: categoria,
      messaggio: messaggio || '—'
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
        success.scrollIntoView({ behavior: 'smooth' });
      } else {
        errorBox.style.display = 'block';
        errorBox.scrollIntoView({ behavior: 'smooth' });
      }
    })
    .catch(function(){
      submitBtn.disabled = false;
      errorBox.style.display = 'block';
      errorBox.scrollIntoView({ behavior: 'smooth' });
    });
  });
})();
