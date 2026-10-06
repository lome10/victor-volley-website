/**
 * Invio email transazionali con Brevo (server UE), condiviso dalle funzioni serverless.
 * Variabili d'ambiente su Vercel (mai nel repository): BREVO_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME (facoltativa,
 * default "ASD Victor Volley"), EMAIL_REPLY_TO (facoltativa), SITE_URL (facoltativa, default https://www.victorvolley.it).
 */
function configEmail() {
  return {
    apiKey: process.env.BREVO_API_KEY, from: process.env.EMAIL_FROM,
    fromName: process.env.EMAIL_FROM_NAME || 'ASD Victor Volley',
    replyTo: process.env.EMAIL_REPLY_TO,
    site: process.env.SITE_URL || 'https://www.victorvolley.it'
  };
}

/** Invia un'email a dest = { email, nome? }; msg = { subject, html, text, attachment? }, con attachment = [{ name, content (base64) }].
 *  Lancia un errore se Brevo rifiuta. */
async function inviaEmail(cfg, dest, msg) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': cfg.apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: cfg.fromName, email: cfg.from },
      replyTo: cfg.replyTo ? { email: cfg.replyTo } : undefined,
      to: [{ email: dest.email, name: dest.nome || undefined }],
      subject: msg.subject, htmlContent: msg.html, textContent: msg.text,
      attachment: msg.attachment
    })
  });
  if (!r.ok) throw new Error('Brevo ' + r.status);
}

module.exports = { configEmail, inviaEmail };
