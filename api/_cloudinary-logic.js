/**
 * Firma dei caricamenti su Cloudinary (solo logica, nessuna rete). Regola ufficiale: sha1 esadecimale di
 * "chiave=valore" ordinati alfabeticamente e uniti con &, con il segreto in coda; restano fuori file,
 * cloud_name, resource_type e api_key. Si usa solo il modulo crypto di Node, nessun pacchetto.
 */
const crypto = require('crypto');

const ESCLUSI = ['file', 'cloud_name', 'resource_type', 'api_key', 'signature'];
const PRESET_DEFAULT = 'victor-day';

/** Stringa da firmare, senza il segreto. I valori vuoti non si firmano; gli array si uniscono con la virgola. */
function stringaDaFirmare(params) {
  return Object.keys(params)
    .filter((k) => ESCLUSI.indexOf(k) === -1 && params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => k + '=' + (Array.isArray(params[k]) ? params[k].join(',') : params[k]))
    .join('&');
}

function firma(params, segreto) {
  return crypto.createHash('sha1').update(stringaDaFirmare(params) + segreto).digest('hex');
}

/** Parametri che il server firma: solo timestamp e preset, scelti dal server (il chiamante non decide nulla). */
function parametriCaricamento(env, adesso) {
  return {
    timestamp: Math.floor((adesso === undefined ? Date.now() : adesso) / 1000),
    upload_preset: (env.CLOUDINARY_PRESET || PRESET_DEFAULT)
  };
}

module.exports = { stringaDaFirmare, firma, parametriCaricamento, PRESET_DEFAULT };
