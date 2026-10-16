/**
 * Il canale YouTube sta trasmettendo in diretta adesso? (funzione serverless Vercel, pubblica)
 *
 * GET /api/youtube-live  →  { live: true|false, lastVideoId: "<id>"|null }
 *
 * Il browser non può chiederlo a YouTube (CORS), quindi lo fa il server: scarica la pagina
 * https://www.youtube.com/channel/<ID>/live e guarda se punta a un video con "isLiveNow":true.
 * Se il canale non trasmette, la pagina rimanda al canale (canonical = pagina del canale).
 * Se YouTube non risponde o cambia formato → { live: false }: la pagina mostra l'ultimo video.
 * lastVideoId = l'ultimo video del canale che si può davvero riprodurre (dal feed RSS, saltando le dirette
 * programmate non ancora iniziate, che in una playlist darebbero "Video non disponibile").
 * Risposta in cache 30 secondi sulla CDN, quindi al massimo 2 richieste al minuto a YouTube.
 */
const CHANNEL_ID = 'UCMz111deWu5j1DFY0Mr-OOA'; // stesso valore di window.YOUTUBE_CHANNEL_ID in js/config.js

/** Vero se l'HTML della pagina /live descrive una diretta in corso. */
function eInDiretta(html) {
  if (!html) return false;
  const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html);
  return !!(canonical && /\/watch\?v=/.test(canonical[1]) && /"isLiveNow":true/.test(html));
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'it-IT,it;q=0.9',
  'Cookie': 'SOCS=CAI; CONSENT=YES+1'
};

let diagnosi = null; // riempito solo con ?debug=1
async function scarica(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: HEADERS });
    const testo = r.ok ? await r.text() : '';
    if (diagnosi) diagnosi.push({ url: url.replace(/channel_id=.*/, 'channel_id=…'), http: r.status, finale: r.url.slice(0, 80), byte: testo.length, isLiveNow: /"isLiveNow":true/.test(testo), playability: (/"playabilityStatus":\{"status":"(\w+)"/.exec(testo) || [])[1] || null });
    return testo;
  } finally { clearTimeout(t); }
}

/** Id dei video del feed RSS del canale, dal più recente. */
function idDalFeed(xml) {
  const ids = [];
  const re = /<yt:videoId>([\w-]{11})<\/yt:videoId>/g;
  let m;
  while ((m = re.exec(xml || ''))) ids.push(m[1]);
  return ids;
}

/** Vero se il video si può guardare adesso. Dal server di Vercel YouTube risponde LOGIN_REQUIRED (controllo
 *  anti-bot) anche per i video normali, mentre una diretta non ancora iniziata dice LIVE_STREAM_OFFLINE:
 *  si scartano solo gli stati che indicano un video non riproducibile. */
function eRiproducibile(html) {
  const m = /"playabilityStatus":\{"status":"(\w+)"/.exec(html || '');
  return !!m && m[1] !== 'LIVE_STREAM_OFFLINE' && m[1] !== 'UNPLAYABLE' && m[1] !== 'ERROR';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  let live = false, lastVideoId = null;
  diagnosi = req && req.query && req.query.debug ? [] : null;
  try {
    live = eInDiretta(await scarica('https://www.youtube.com/channel/' + CHANNEL_ID + '/live'));
  } catch (e) {
    console.warn('[youtube-live] YouTube non raggiungibile:', e && e.message);
  }
  if (!live) {
    try {
      const ids = idDalFeed(await scarica('https://www.youtube.com/feeds/videos.xml?channel_id=' + CHANNEL_ID)).slice(0, 5);
      for (const id of ids) {
        const html = await scarica('https://www.youtube.com/watch?v=' + id);
        if (/"isLiveNow":true/.test(html)) { live = true; break; } // diretta in corso non vista dalla pagina /live
        if (eRiproducibile(html)) { lastVideoId = id; break; }
      }
    } catch (e) {
      console.warn('[youtube-live] ultimo video non ricavabile:', e && e.message);
    }
  }
  res.status(200).json(diagnosi ? { live, lastVideoId, diagnosi } : { live, lastVideoId });
};

module.exports.eInDiretta = eInDiretta;
module.exports.idDalFeed = idDalFeed;
module.exports.eRiproducibile = eRiproducibile;
