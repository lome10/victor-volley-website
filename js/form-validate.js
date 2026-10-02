/* Victor Volley — validazione e stato di invio condivisi dai form pubblici (contatti, unisciti a noi).
   Errori sotto ogni campo (role="alert", aria-invalid, aria-describedby), focus sul primo campo errato,
   pulsante disattivato con testo "Invio in corso…", invio con timeout. */
var VVForm = (function () {
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function errorEl(field) {
    var id = field.id + '-err';
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('p');
      el.id = id;
      el.className = 'form-error';
      el.setAttribute('role', 'alert');
      el.hidden = true;
      field.parentNode.appendChild(el);
      field.setAttribute('aria-describedby', id);
      var clear = function () { setError(field, ''); };
      field.addEventListener('input', clear);
      field.addEventListener('change', clear);
    }
    return el;
  }

  function setError(field, msg) {
    var el = errorEl(field);
    el.textContent = msg;
    el.hidden = !msg;
    field.classList.toggle('is-invalid', !!msg);
    if (msg) field.setAttribute('aria-invalid', 'true'); else field.removeAttribute('aria-invalid');
  }

  function messageFor(field) {
    if (field.type === 'checkbox') return field.required && !field.checked ? 'Per inviare devi spuntare questa casella.' : '';
    var v = (field.value || '').trim();
    if (field.required && !v) return field.tagName === 'SELECT' ? 'Scegli un’opzione.' : 'Campo obbligatorio.';
    if (v && field.type === 'email' && !EMAIL_RE.test(v)) return 'Inserisci un indirizzo email valido.';
    if (v && field.type === 'tel' && v.replace(/\D/g, '').length < 6) return 'Inserisci un numero di telefono valido.';
    return '';
  }

  /* Controlla tutti i campi; mostra gli errori sotto ciascuno e porta il focus sul primo. true se tutto ok. */
  function validate(form) {
    var first = null;
    Array.prototype.forEach.call(form.querySelectorAll('input, select, textarea'), function (f) {
      if (f.type === 'hidden' || f.type === 'submit') return;
      var msg = messageFor(f);
      setError(f, msg);
      if (msg && !first) first = f;
    });
    if (first) first.focus();
    return !first;
  }

  function setBusy(btn, busy, busyLabel) {
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.textContent;
      btn.textContent = busyLabel || 'Invio in corso…';
    } else if (btn.dataset.label) {
      btn.textContent = btn.dataset.label;
    }
    btn.disabled = busy;
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  /* POST JSON con timeout; risolve con l'oggetto risposta, rifiuta su errore di rete o timeout. */
  function send(url, payload, timeoutMs) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 15000) : null;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) { return res.json(); })
      .then(function (d) { if (timer) clearTimeout(timer); return d; },
            function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  function show(box) {
    box.style.display = 'block';
    box.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    box.focus({ preventScroll: true });
  }

  /* Collega un form: opts = { success, error, busyLabel, payload: function () { return {...}; } } */
  function attach(form, opts) {
    var btn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      opts.success.style.display = 'none';
      opts.error.style.display = 'none';
      if (!validate(form)) return;
      setBusy(btn, true, opts.busyLabel);
      send('https://api.web3forms.com/submit', opts.payload())
        .then(function (data) {
          setBusy(btn, false);
          if (data && data.success) { form.reset(); show(opts.success); } else { show(opts.error); }
        })
        .catch(function () { setBusy(btn, false); show(opts.error); });
    });
  }

  return { attach: attach, validate: validate };
})();
