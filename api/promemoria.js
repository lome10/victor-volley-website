/**
 * Promemoria di scadenza via email ai genitori (funzione serverless Vercel, lanciata ogni giorno da Vercel Cron:
 * vedi "crons" in vercel.json). Soglie e testo: api/_promemoria-logic.js.
 *
 * GET /api/promemoria            (solo con Authorization: Bearer <CRON_SECRET>)
 * GET /api/promemoria?dry=1      prova a secco: calcola e riassume, senza inviare né scrivere nulla
 *
 * Variabili d'ambiente su Vercel (mai nel repository):
 *   FIREBASE_SERVICE_ACCOUNT   JSON dell'account di servizio (la stessa di set-athlete-password)
 *   CRON_SECRET                stringa lunga e casuale; Vercel Cron la manda come "Authorization: Bearer ..."
 *   BREVO_API_KEY              chiave API del servizio di invio email (Brevo, server UE)
 *   EMAIL_FROM                 indirizzo del mittente, verificato sul servizio (es. promemoria@victorvolley.it)
 *   EMAIL_FROM_NAME            (facoltativa) nome del mittente, default "ASD Victor Volley"
 *   EMAIL_REPLY_TO             (facoltativa) indirizzo a cui arrivano le risposte delle famiglie (es. una casella Libero)
 *   SITE_URL                   (facoltativa) default https://www.victorvolley.it
 * Se CRON_SECRET, BREVO_API_KEY o EMAIL_FROM mancano, la funzione non fa nulla e risponde 200 con "skipped":
 * si può pubblicare prima di aver configurato il servizio.
 *
 * Idempotenza: ogni promemoria (chiave + destinatario) lascia un documento in promemoriaInviati/ e non viene
 * rispedito. I genitori che hanno disattivato i promemoria (notifiche/{uid}.email == false) sono esclusi.
 */
const crypto = require('crypto');
const { getApp } = require('./_firebase');
const L = require('./_promemoria-logic');
const { configEmail, inviaEmail } = require('./_email');
const { docId, calcolaDaInviare } = require('./_promemoria-calcolo');

const mask = (e) => e.replace(/^(.).*@(.).*(\..+)$/, '$1***@$2***$3');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metodo non consentito.' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(200).json({ skipped: 'CRON_SECRET non configurata' });
  /* confronto a tempo costante (si confrontano le impronte, che hanno sempre la stessa lunghezza) */
  const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
  if (!crypto.timingSafeEqual(sha(req.headers.authorization || ''), sha('Bearer ' + secret))) return res.status(401).json({ error: 'Non autorizzato.' });

  const dry = String((req.query && req.query.dry) || '') === '1';
  const cfg = configEmail();
  if (!dry && (!cfg.apiKey || !cfg.from)) return res.status(200).json({ skipped: 'servizio email non configurato' });

  let db;
  try { db = getApp().firestore(); } catch (e) {
    console.error('[promemoria] configurazione:', e.message);
    return res.status(500).json({ error: 'Funzione non configurata sul server.' });
  }

  try {
    const oggi = L.oggiRoma();
    // calcolo condiviso con l'anteprima dei dirigenti: api/_promemoria-calcolo.js
    const { calcolati, esistenti, gruppi } = await calcolaDaInviare(db, oggi);
    const riepilogo = { oggi, calcolati: calcolati.length, giaInviati: esistenti.size, destinatari: gruppi.length, inviati: 0, errori: 0 };

    if (dry) {
      riepilogo.dry = true;
      riepilogo.anteprima = gruppi.map((g) => ({ a: mask(g.email), promemoria: g.voci.map((v) => v.chiave) }));
      return res.status(200).json(riepilogo);
    }

    for (let i = 0; i < gruppi.length; i += 5) {
      await Promise.all(gruppi.slice(i, i + 5).map(async (g) => {
        try {
          await inviaEmail(cfg, g, L.componiEmail(g, cfg.site));
          const batch = db.batch();
          g.voci.forEach((v) => {
            batch.set(db.collection('promemoriaInviati').doc(docId(v.chiave, g.email)), {
              chiave: v.chiave, tipo: v.tipo, atletaId: v.atletaId, giorno: oggi, inviatoIl: new Date().toISOString(), destinatario: mask(g.email)
            });
          });
          await batch.commit();
          riepilogo.inviati++;
        } catch (e) {
          riepilogo.errori++;
          console.error('[promemoria] invio fallito:', e.message);   // niente indirizzi nei log
        }
      }));
    }
    console.log('[promemoria]', JSON.stringify(riepilogo));
    return res.status(200).json(riepilogo);
  } catch (e) {
    console.error('[promemoria] errore:', e.message);
    return res.status(500).json({ error: 'Errore durante l’elaborazione dei promemoria.' });
  }
};
