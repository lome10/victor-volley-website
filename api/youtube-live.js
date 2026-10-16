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

async function scarica(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: HEADERS });
    return r.ok ? await r.text() : '';
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

/** Vero se la pagina del video dice che si può guardare adesso (non una diretta ancora da iniziare). */
function eRiproducibile(html) {
  const m = /"playabilityStatus":\{"status":"(\w+)"/.exec(html || '');
  return !!(m && m[1] === 'OK');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  let live = false, lastVideoId = null;
  try {
    live = eInDiretta(await scarica('https://www.youtube.com/channel/' + CHANNEL_ID + '/live'));
  } catch (e) {
    console.warn('[youtube-live] YouTube non raggiungibile:', e && e.message);
  }
  if (!live) {
    try {
      const ids = idDalFeed(await scarica('https://www.youtube.com/feeds/videos.xml?channel_id=' + CHANNEL_ID)).slice(0, 5);
      for (const id of ids) {
        if (eRiproducibile(await scarica('https://www.youtube.com/watch?v=' + id))) { lastVideoId = id; break; }
      }
    } catch (e) {
      console.warn('[youtube-live] ultimo video non ricavabile:', e && e.message);
    }
  }
  res.status(200).json({ live, lastVideoId });
};

module.exports.eInDiretta = eInDiretta;
module.exports.idDalFeed = idDalFeed;
module.exports.eRiproducibile = eRiproducibile;
