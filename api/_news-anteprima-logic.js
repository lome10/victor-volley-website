/**
 * Anteprima di condivisione di un articolo (solo logica, nessuna rete): prende la pagina news-articolo.html (servita anche come /news-dettaglio) e
 * sostituisce titolo, descrizione, immagine e indirizzo con quelli dell'articolo vero, così WhatsApp, Facebook,
 * Telegram ecc. (che non eseguono JavaScript) mostrano l'articolo e non «Articolo — Victor Volley».
 * Stesse regole del sito (js/pages/news-dettaglio-1.js): titolo «<titolo> — Victor Volley», riassunto = excerpt o prime
 * parole del testo, immagine solo se è un indirizzo vero (mai base64), canonical /news-dettaglio?id=N.
 */
const SITE = 'https://www.victorvolley.it';
const FIRMA = ' — Victor Volley';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Testo semplice dall'HTML dell'articolo: niente tag, niente script, spazi ridotti. */
function testoSemplice(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li)>|<br\s*\/?>/gi, '$& ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function descrizione(article) {
  const ex = String(article.excerpt || '').trim();
  if (ex) return ex.length > 200 ? ex.slice(0, 200).replace(/\s+\S*$/, '') + '…' : ex;
  const txt = testoSemplice(article.content);
  return txt.length > 155 ? txt.slice(0, 155).replace(/\s+\S*$/, '') + '…' : txt;
}

/** Immagine per i social: solo indirizzi https veri; su Cloudinary 1200 px in JPEG (i social non leggono tutti il webp). */
function immagineSocial(url) {
  const u = String(url || '').trim();
  if (!/^https:\/\//.test(u) || u.length > 600) return '';
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/.exec(u);
  return m ? m[1] + 'f_jpg,q_auto,c_limit,w_1200/' + m[2] : u;
}

function id(articolo) { return Number.isInteger(+articolo.id) && +articolo.id > 0 ? +articolo.id : 0; }

/** Sostituisce un tag <meta>/<title> trovato per chiave; se non c'è, lo aggiunge prima di </head>. */
function impostaMeta(html, riconosci, nuovo) {
  const re = riconosci;
  return re.test(html) ? html.replace(re, () => nuovo) : html.replace('</head>', () => '  ' + nuovo + '\n</head>');
}

function inietta(html, article) {
  const n = id(article);
  const titolo = String(article.title || '').trim();
  if (!n || !titolo) return html;
  const url = SITE + '/news-dettaglio?id=' + n;
  const titoloPagina = titolo + FIRMA;
  const desc = descrizione(article);
  const img = immagineSocial(article.image);

  let h = html;
  h = impostaMeta(h, /<title>[^<]*<\/title>/i, '<title>' + esc(titoloPagina) + '</title>');
  h = impostaMeta(h, /<meta property="og:title"[^>]*>/i, '<meta property="og:title" content="' + esc(titoloPagina) + '">');
  h = impostaMeta(h, /<meta property="og:type"[^>]*>/i, '<meta property="og:type" content="article">');
  h = impostaMeta(h, /<meta property="og:url"[^>]*>/i, '<meta property="og:url" content="' + url + '">');
  h = impostaMeta(h, /<link rel="canonical"[^>]*>/i, '<link rel="canonical" href="' + url + '">');
  if (desc) {
    h = impostaMeta(h, /<meta name="description"[^>]*>/i, '<meta name="description" content="' + esc(desc) + '">');
    h = impostaMeta(h, /<meta property="og:description"[^>]*>/i, '<meta property="og:description" content="' + esc(desc) + '">');
  }
  if (img) {
    h = impostaMeta(h, /<meta property="og:image"[^>]*>/i, '<meta property="og:image" content="' + esc(img) + '">');
    /* Le misure scritte nella pagina (1200x630) valgono per l'immagine del sito, non per questa. */
    h = h.replace(/\s*<meta property="og:image:(width|height)"[^>]*>/gi, '');
  }
  return h;
}

/** Id articolo dalla query: solo cifre, massimo 9. Altrimenti 0. */
function idDaQuery(valore) {
  const s = Array.isArray(valore) ? valore[0] : valore;
  return /^\d{1,9}$/.test(String(s || '')) ? parseInt(s, 10) : 0;
}

module.exports = { inietta, descrizione, immagineSocial, testoSemplice, idDaQuery, esc, SITE };
