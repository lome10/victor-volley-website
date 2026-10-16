/**
 * Il canale YouTube sta trasmettendo in diretta adesso? (funzione serverless Vercel, pubblica)
 *
 * GET /api/youtube-live  →  { live: true|false }
 *
 * Il browser non può chiederlo a YouTube (CORS), quindi lo fa il server: scarica la pagina
 * https://www.youtube.com/channel/<ID>/live e guarda se punta a un video con "isLiveNow":true.
 * Se il canale non trasmette, la pagina rimanda al canale (canonical = pagina del canale).
 * Se YouTube non risponde o cambia formato → { live: false }: la pagina mostra l'ultimo video.
 * Risposta in cache 30 secondi sulla CDN, quindi al massimo 2 richieste al minuto a YouTube.
 */
const CHANNEL_ID = 'UCMz111deWu5j1DFY0Mr-OOA'; // stesso valore di window.YOUTUBE_CHANNEL_ID in js/config.js

/** Vero se l'HTML della pagina /live descrive una diretta in corso. */
function eInDiretta(html) {
  if (!html) return false;
  const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html);
  return !!(canonical && /\/watch\?v=/.test(canonical[1]) && /"isLiveNow":true/.test(html));
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  let live = false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch('https://www.youtube.com/channel/' + CHANNEL_ID + '/live', {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'it-IT,it;q=0.9',
        'Cookie': 'SOCS=CAI; CONSENT=YES+1'
      }
    });
    clearTimeout(t);
    if (r.ok) live = eInDiretta(await r.text());
  } catch (e) {
    console.warn('[youtube-live] YouTube non raggiungibile:', e && e.message);
  }
  res.status(200).json({ live });
};

module.exports.eInDiretta = eInDiretta;
