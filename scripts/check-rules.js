#!/usr/bin/env node
/**
 * Collaudo delle REGOLE di Firestore (ruoli dei dirigenti) sull'emulatore ufficiale:  node scripts/check-rules.js
 * (oppure: npm run test:rules). Parte da solo con «firebase emulators:exec» (serve il CLI firebase e Java; l'emulatore
 * si scarica la prima volta). Non tocca il database vero: progetto finto «demo-vv». Se il CLI non c'è, salta con un avviso.
 *
 * Verifica soprattutto che NESSUNO perda un permesso per errore:
 *   - dirigente SENZA campo ruolo (tutti quelli di oggi), «presidente» e «master»: stessi permessi di prima, collezione per collezione;
 *   - master: assegna i ruoli; non è declassabile né eliminabile da altri; «master» non si scrive dal browser;
 *   - segreteria: atleti, ricevute, presenze; niente budget, niente dirigenti, niente contenuti del sito;
 *   - presenze: solo presenze (e leggere l'elenco atleti);
 *   - ruolo non riconosciuto / vuoto / maiuscolo: nessun permesso o, se vuoto, come presidente;
 *   - famiglie, atleti, allenatori, anonimi: invariati.
 */
const assert = require('assert');
const { spawnSync } = require('child_process');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const r = spawnSync('firebase emulators:exec --only firestore --project demo-vv "node scripts/check-rules.js"', { stdio: 'inherit', shell: true, cwd: require('path').join(__dirname, '..') });
  if (r.error || r.status === null) { console.log('SALTATO: firebase CLI o Java non disponibili, regole non collaudate.'); process.exit(0); }
  process.exit(r.status);
}

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const BASE = 'http://' + HOST + '/v1/projects/demo-vv/databases/(default)/documents';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (uid) => b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ user_id: uid, sub: uid, iss: 'https://securetoken.google.com/demo-vv', aud: 'demo-vv' }) + '.';

function toFs(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
}
const fields = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, x]) => [k, toFs(x)])) });

/** op: 'get' | 'set' | 'del' | 'merge' (aggiorna solo i campi dati). Ritorna true se le regole lo consentono. */
async function prova(uid, op, path, data) {
  const headers = { 'Content-Type': 'application/json' };
  if (uid === 'OWNER') headers.Authorization = 'Bearer owner'; else if (uid) headers.Authorization = 'Bearer ' + token(uid);
  let res;
  if (op === 'get') res = await fetch(BASE + '/' + path, { headers });
  else if (op === 'del') res = await fetch(BASE + '/' + path, { method: 'DELETE', headers });
  else {
    const mask = op === 'merge' ? '?' + Object.keys(data).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') : '';
    res = await fetch(BASE + '/' + path + mask, { method: 'PATCH', headers, body: JSON.stringify(fields(data)) });
  }
  if (res.status === 403) return false;
  if (res.status === 404 && op === 'get') return true;   // permesso c'è, il documento no
  if (!res.ok) throw new Error(op + ' ' + path + ' → ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return true;
}
const semina = (path, data) => prova('OWNER', 'set', path, data);

let n = 0, falliti = 0;
async function atteso(uid, op, path, data, ok, nota) {
  let got;
  try { got = await prova(uid, op, path, data); } catch (e) { falliti++; console.error('ERRORE ' + uid + ' ' + op + ' ' + path + ': ' + e.message); return; }
  n++;
  if (got !== ok) { falliti++; console.error('FALLITO: ' + (uid || 'anonimo') + ' ' + op + ' ' + path + ' → ' + (got ? 'CONSENTITO' : 'NEGATO') + ' (atteso ' + (ok ? 'consentito' : 'negato') + ')' + (nota ? ' — ' + nota : '')); }
}

(async () => {
  /* ---- dati di partenza ---- */
  await semina('dirigenti/pres', { nome: 'Senza campo' });                 // come tutti i dirigenti di oggi
  await semina('dirigenti/pres2', { nome: 'Pres', ruolo: 'presidente' });
  await semina('dirigenti/mas', { nome: 'Master', ruolo: 'master' });
  await semina('dirigenti/mas2', { nome: 'Master2', ruolo: 'MASTER' });
  await semina('dirigenti/seg', { nome: 'Seg', ruolo: 'segreteria' });
  await semina('dirigenti/prs', { nome: 'Prs', ruolo: 'presenze' });
  await semina('dirigenti/boh', { nome: 'Boh', ruolo: 'boh' });
  await semina('dirigenti/vuoto', { nome: 'Vuoto', ruolo: '' });
  await semina('dirigenti/maiusc', { nome: 'Maiusc', ruolo: 'Segreteria' });
  await semina('allenatori/mister', { categorie: ['S3'] });
  await semina('atleti/a1', { nome: 'A', accessUids: ['fam'], categoria: 'S3' });
  await semina('accessi/fam', { categorie: ['S3'] });
  await semina('ricevute/r1', { stato: 'valida', atletaId: 'a1', numero: '2026/0001' });
  await semina('comunicazioni/c1', { categoria: 'tutte' });
  await semina('presenze/p1', { atletaId: 'a1', eventKey: 'e', risposta: 'si' });
  for (const c of ['articles', 'partite', 'allenamenti', 'allenamentiEccezioni', 'albums', 'categories', 'players', 'staff', 'siteData', 'giocatoriDati', 'atletiDati',
    'budgetSeasons', 'aziende', 'sponsorizzazioni', 'tranchePagamento', 'attivita', 'promemoria', 'pianoEditoriale', 'bacheca', 'categorieAtleti', 'atletiRette',
    'rateAtleti', 'contatoriRicevute', 'firme', 'tessere', 'supercoppaBari', 'altreEntrate', 'vociSpesa', 'sottospese', 'categorieSpesa', 'presenzeAllenamento', 'promemoriaInviati']) {
    await semina(c + '/x', { atletaId: 'a1', v: 1 });
  }
  await semina('settings/asd', { denominazione: 'ASD' }); await semina('settings/seasons', { items: [] });
  await semina('notifiche/pres', { email: true });

  /* ================= 1. NESSUNA PERDITA per chi c'è oggi: dirigente senza campo e «presidente» ================= */
  const tuttiRW = ['articles', 'partite', 'allenamenti', 'allenamentiEccezioni', 'albums', 'categories', 'players', 'staff', 'siteData', 'giocatoriDati', 'atletiDati',
    'budgetSeasons', 'aziende', 'sponsorizzazioni', 'tranchePagamento', 'attivita', 'promemoria', 'pianoEditoriale', 'bacheca', 'categorieAtleti', 'atletiRette',
    'rateAtleti', 'contatoriRicevute', 'firme', 'tessere', 'supercoppaBari', 'altreEntrate', 'vociSpesa', 'sottospese', 'categorieSpesa', 'atleti', 'accessi', 'comunicazioni', 'allenatori'];
  for (const u of ['pres', 'pres2', 'vuoto', 'mas', 'mas2']) {
    for (const c of tuttiRW) {
      const id = c === 'accessi' ? 'fam' : c === 'allenatori' ? 'mister' : c === 'atleti' ? 'a1' : c === 'comunicazioni' ? 'c1' : 'x';
      await atteso(u, 'get', c + '/' + id, null, true);
      await atteso(u, 'set', c + '/' + id, { atletaId: 'a1', v: 2, categoria: 'S3', accessUids: ['fam'] }, true);
    }
    await atteso(u, 'get', 'settings/asd', null, true);
    await atteso(u, 'set', 'settings/seasons', { items: [] }, true);
    await atteso(u, 'set', 'settings/asd', { denominazione: 'ASD2' }, true);
    await atteso(u, 'get', 'dirigenti/pres', null, true); await atteso(u, 'get', 'dirigenti/seg', null, true);
    await atteso(u, 'set', 'dirigenti/nuovo_' + u, { nome: 'Nuovo' }, true, 'creare un dirigente senza ruolo (come oggi)');
    await atteso(u, 'set', 'dirigenti/nuovo2_' + u, { nome: 'Nuovo', ruolo: 'segreteria' }, u === 'mas' || u === 'mas2', 'creare un dirigente CON ruolo: solo il master');
    await atteso(u, 'merge', 'dirigenti/seg', { taglie: { polo: 'M' } }, true);
    await atteso(u, 'del', 'dirigenti/nuovo_' + u, null, true);
    await atteso(u, 'get', 'presenzeAllenamento/x', null, true); await atteso(u, 'set', 'presenzeAllenamento/x', { v: 3 }, false, 'solo il server');
    await atteso(u, 'get', 'promemoriaInviati/x', null, true); await atteso(u, 'set', 'promemoriaInviati/x', { v: 3 }, false);
    await atteso(u, 'set', 'presenze/p1', { atletaId: 'a1', eventKey: 'e', risposta: 'no' }, true); await atteso(u, 'del', 'presenze/p1', null, true);
    await atteso(u, 'set', 'presenze/p1', { atletaId: 'a1', eventKey: 'e', risposta: 'si' }, true);
    await atteso(u, 'get', 'ricevute/r1', null, true);
    await atteso(u, 'set', 'ricevute/nuova_' + u, { stato: 'valida', atletaId: 'a1', numero: '2026/0002' }, true);
    await atteso(u, 'merge', 'ricevute/r1', { stato: 'annullata', dataAnnullamento: '2026-11-12', motivoAnnullamento: 'x', annullataDa: u }, true);
    await atteso(u, 'del', 'ricevute/r1', null, false, 'le ricevute non si cancellano');
    await semina('ricevute/r1', { stato: 'valida', atletaId: 'a1', numero: '2026/0001' });
    await atteso(u, 'set', 'auditLog/l_' + u, { dirigenteId: u, azione: 'create' }, true);
    await atteso(u, 'set', 'auditLog/l2_' + u, { dirigenteId: 'altro', azione: 'create' }, false, 'solo a nome proprio');
    await atteso(u, 'get', 'auditLog/l_' + u, null, true);
    await atteso(u, 'set', 'auditLog/l_' + u, { dirigenteId: u, azione: 'x' }, false, 'append-only');
    await atteso(u, 'get', 'notifiche/pres', null, true);
    await atteso(u, 'get', 'inviti/x', null, false);
  }

  /* ================= 2. segreteria ================= */
  const S = 'seg';
  for (const c of ['atleti', 'atletiDati', 'accessi', 'comunicazioni', 'categorieAtleti', 'atletiRette', 'rateAtleti', 'contatoriRicevute', 'firme']) {
    const id = c === 'accessi' ? 'fam' : c === 'atleti' ? 'a1' : c === 'comunicazioni' ? 'c1' : 'x';
    await atteso(S, 'get', c + '/' + id, null, true); await atteso(S, 'set', c + '/' + id, { atletaId: 'a1', v: 5, categoria: 'S3', accessUids: ['fam'] }, true);
  }
  await atteso(S, 'set', 'ricevute/nuova_seg', { stato: 'valida', atletaId: 'a1', numero: '2026/0003' }, true);
  await atteso(S, 'get', 'ricevute/r1', null, true); await atteso(S, 'get', 'settings/asd', null, true); await atteso(S, 'get', 'settings/seasons', null, true);
  await atteso(S, 'set', 'presenze/p1', { atletaId: 'a1', eventKey: 'e', risposta: 'no' }, true);
  await atteso(S, 'set', 'allenamentiEccezioni/x', { v: 6 }, true); await atteso(S, 'get', 'presenzeAllenamento/x', null, true);
  await atteso(S, 'get', 'dirigenti/pres', null, true, 'serve a bacheca e budget per i nomi');
  await atteso(S, 'merge', 'dirigenti/pres', { taglie: { polo: 'L' } }, true, 'taglie dei dirigenti dall\'elenco atleti');
  await atteso(S, 'merge', 'dirigenti/pres', { ruolo: 'segreteria' }, false, 'non può cambiare ruoli');
  await atteso(S, 'merge', 'dirigenti/seg', { ruolo: 'presidente' }, false, 'non può promuoversi');
  await atteso(S, 'merge', 'dirigenti/seg', { taglie: { polo: 'M' }, ruolo: 'presidente' }, false);
  await atteso(S, 'set', 'dirigenti/nuovo_seg', { nome: 'X' }, false); await atteso(S, 'del', 'dirigenti/pres', null, false);
  for (const c of ['budgetSeasons', 'aziende', 'sponsorizzazioni', 'tranchePagamento', 'attivita', 'promemoria', 'pianoEditoriale', 'bacheca', 'tessere', 'supercoppaBari', 'altreEntrate', 'vociSpesa', 'sottospese', 'categorieSpesa']) {
    await atteso(S, 'get', c + '/x', null, false, 'budget: solo presidente'); await atteso(S, 'set', c + '/x', { v: 7 }, false);
  }
  for (const c of ['articles', 'partite', 'allenamenti', 'albums', 'categories', 'players', 'staff', 'siteData', 'giocatoriDati']) {
    await atteso(S, 'set', c + '/x', { v: 7 }, false, 'contenuti del sito: solo presidente');
  }
  await atteso(S, 'set', 'settings/seasons', { items: [] }, false); await atteso(S, 'get', 'auditLog/l_pres', null, false);
  await atteso(S, 'set', 'auditLog/l_seg', { dirigenteId: S, azione: 'create' }, true, 'scrive il Log');
  await atteso(S, 'get', 'promemoriaInviati/x', null, false);
  await atteso(S, 'get', 'articles/x', null, true, 'il sito resta pubblico');

  /* ================= 3. presenze ================= */
  const P = 'prs';
  await atteso(P, 'get', 'presenze/p1', null, true); await atteso(P, 'set', 'presenze/p1', { atletaId: 'a1', eventKey: 'e', risposta: 'si' }, true);
  await atteso(P, 'del', 'presenze/p1', null, true); await semina('presenze/p1', { atletaId: 'a1', eventKey: 'e', risposta: 'si' });
  await atteso(P, 'set', 'allenamentiEccezioni/x', { v: 8 }, true); await atteso(P, 'get', 'presenzeAllenamento/x', null, true);
  await atteso(P, 'get', 'atleti/a1', null, true, 'elenco atleti per le presenze');
  await atteso(P, 'set', 'auditLog/l_prs', { dirigenteId: P, azione: 'create' }, true);
  await atteso(P, 'get', 'dirigenti/prs', null, true, 'il proprio profilo (accesso al pannello)');
  await atteso(P, 'get', 'dirigenti/pres', null, false);
  for (const c of ['atletiDati', 'accessi', 'comunicazioni', 'rateAtleti', 'atletiRette', 'categorieAtleti', 'contatoriRicevute', 'firme', 'budgetSeasons', 'altreEntrate', 'bacheca', 'pianoEditoriale', 'giocatoriDati']) {
    await atteso(P, 'get', c + '/' + (c === 'accessi' ? 'fam' : c === 'comunicazioni' ? 'c1' : 'x'), null, false); await atteso(P, 'set', c + '/x', { v: 9 }, false);
  }
  await atteso(P, 'set', 'atleti/a1', { nome: 'B', accessUids: ['fam'], categoria: 'S3' }, false); await atteso(P, 'get', 'ricevute/r1', null, false);
  await atteso(P, 'set', 'ricevute/nuova_prs', { stato: 'valida', atletaId: 'a1' }, false); await atteso(P, 'get', 'settings/asd', null, false);
  await atteso(P, 'set', 'articles/x', { v: 1 }, false); await atteso(P, 'merge', 'dirigenti/prs', { taglie: { polo: 'S' } }, false);
  await atteso(P, 'merge', 'dirigenti/prs', { ruolo: 'presidente' }, false, 'non può promuoversi');
  await atteso(P, 'get', 'auditLog/l_pres', null, false);

  /* ================= 4. ruolo non riconosciuto o scritto male: nessun permesso ================= */
  for (const u of ['boh', 'maiusc']) {
    const atteseSeg = u === 'maiusc';   // «Segreteria» maiuscolo vale come segreteria (si confronta in minuscolo)
    await atteso(u, 'get', 'atletiDati/x', null, atteseSeg); await atteso(u, 'set', 'budgetSeasons/x', { v: 1 }, false); await atteso(u, 'set', 'dirigenti/zz', { nome: 'a' }, false);
    await atteso(u, 'get', 'presenze/p1', null, atteseSeg); await atteso(u, 'set', 'auditLog/l_' + u, { dirigenteId: u, azione: 'c' }, atteseSeg);
    await atteso(u, 'get', 'dirigenti/' + u, null, true, 'il proprio profilo si legge sempre: il pannello non si blocca in modo strano');
  }

  /* ================= 5. master: assegna i ruoli; presidente e gli altri no ================= */
  await semina('dirigenti/t1', { nome: 'T' }); await semina('dirigenti/t2', { nome: 'T2', ruolo: 'presenze' });
  await atteso('pres', 'set', 'dirigenti/t1x', { nome: 'T', ruolo: 'presenze' }, false, 'il presidente non assegna ruoli');
  await atteso('pres', 'merge', 'dirigenti/t1', { ruolo: 'segreteria' }, false);
  await atteso('pres', 'merge', 'dirigenti/t2', { ruolo: 'presidente' }, false);
  await atteso('pres', 'set', 'dirigenti/t2', { nome: 'T2' }, false, 'nemmeno togliendo il campo');
  await atteso('pres', 'merge', 'dirigenti/t1', { taglie: { polo: 'M' } }, true, 'il resto del documento sì, come prima');
  await atteso('pres', 'set', 'dirigenti/n6', { nome: 'N6' }, true, 'creare senza ruolo: come prima');
  await atteso('pres', 'set', 'dirigenti/n5', { nome: 'N5', ruolo: 'segreteria' }, false);
  for (const m of ['mas', 'mas2']) {
    await atteso(m, 'merge', 'dirigenti/t1', { ruolo: 'segreteria' }, true, 'il master assegna');
    await atteso(m, 'merge', 'dirigenti/t1', { ruolo: 'presenze' }, true);
    await atteso(m, 'merge', 'dirigenti/t1', { ruolo: 'presidente' }, true);
    await atteso(m, 'set', 'dirigenti/t2', { nome: 'T2' }, true, 'togliere il ruolo = presidente');
    await semina('dirigenti/t2', { nome: 'T2', ruolo: 'presenze' });
    for (const v of ['qualcosa', 'Admin', 'master', 'MASTER', '']) await atteso(m, 'merge', 'dirigenti/t1', { ruolo: v }, false, 'valore non assegnabile: ' + v);
    await atteso(m, 'merge', 'dirigenti/t1', { ruolo: 5 }, false);
    await atteso(m, 'set', 'dirigenti/n4_' + m, { nome: 'N4', ruolo: 'presenze' }, true);
    await atteso(m, 'set', 'dirigenti/n3_' + m, { nome: 'N3', ruolo: 'master' }, false, '«master» non si scrive dal browser');
    await atteso(m, 'del', 'dirigenti/n4_' + m, null, true);
  }
  /* il documento del master: solo lui, senza toccare il ruolo; non si elimina; gli altri non lo declassano */
  await atteso('mas', 'merge', 'dirigenti/mas', { ruolo: 'presidente' }, false, 'il master non si declassa da solo');
  await atteso('mas', 'set', 'dirigenti/mas', { nome: 'Master' }, false, 'né togliendo il campo');
  await atteso('mas', 'merge', 'dirigenti/mas', { nome: 'Master M' }, true);
  await atteso('mas', 'merge', 'dirigenti/mas', { taglie: { polo: 'L' } }, true);
  await atteso('mas', 'del', 'dirigenti/mas', null, false, 'nessuno elimina un master dal browser, nemmeno lui');
  await atteso('mas', 'merge', 'dirigenti/mas2', { ruolo: 'presidente' }, false, 'un master non declassa un altro master');
  await atteso('mas', 'merge', 'dirigenti/mas2', { nome: 'x' }, false);
  await atteso('mas', 'del', 'dirigenti/mas2', null, false);
  for (const u of ['pres', 'pres2', 'vuoto', 'seg', 'prs', 'boh']) {
    await atteso(u, 'merge', 'dirigenti/mas', { ruolo: 'presidente' }, false, u + ' non declassa il master');
    await atteso(u, 'merge', 'dirigenti/mas', { nome: 'Hack' }, false);
    await atteso(u, 'set', 'dirigenti/mas', { nome: 'Hack' }, false);
    await atteso(u, 'del', 'dirigenti/mas', null, false, u + ' non elimina il master');
    await atteso(u, 'merge', u === 'vuoto' ? 'dirigenti/vuoto' : 'dirigenti/' + u, { ruolo: 'master' }, false, u + ' non si promuove master');
  }
  await atteso('pres', 'merge', 'dirigenti/mas', { taglie: { polo: 'XL' } }, true, 'la taglia dei dirigenti, master compreso, si imposta dall\'elenco atleti');
  await atteso('seg', 'merge', 'dirigenti/mas', { taglie: { polo: 'S' } }, true);
  await atteso('prs', 'merge', 'dirigenti/mas', { taglie: { polo: 'S' } }, false);
  await atteso('pres', 'del', 'dirigenti/n6', null, true, 'il presidente elimina dirigenti come prima');
  await atteso('pres', 'del', 'dirigenti/t1', null, true);
  await atteso('seg', 'del', 'dirigenti/t2', null, false);

  /* ================= 6. chi non è dirigente: invariato ================= */
  /* i punti 1-5 hanno riscritto alcuni documenti di prova: si rimettono come all'inizio */
  await semina('accessi/fam', { categorie: ['S3'] }); await semina('comunicazioni/c1', { categoria: 'tutte' }); await semina('atleti/a1', { nome: 'A', accessUids: ['fam'], categoria: 'S3' });
  for (const u of [null, 'estraneo', 'fam', 'mister']) {
    for (const c of ['atletiDati', 'budgetSeasons', 'altreEntrate', 'bacheca', 'giocatoriDati', 'contatoriRicevute', 'firme', 'presenzeAllenamento', 'auditLog']) await atteso(u, 'get', c + '/x', null, false);
    await atteso(u, 'set', 'articles/x', { v: 1 }, false); await atteso(u, 'set', 'dirigenti/' + (u || 'anon'), { nome: 'x' }, false); await atteso(u, 'set', 'atleti/a1', { nome: 'x' }, false);
    await atteso(u, 'get', 'settings/asd', null, false); await atteso(u, 'get', 'settings/seasons', null, true); await atteso(u, 'get', 'articles/x', null, true);
    await atteso(u, 'get', 'inviti/x', null, false);
  }
  await atteso('fam', 'get', 'atleti/a1', null, true); await atteso('fam', 'get', 'rateAtleti/x', null, true); await atteso('fam', 'get', 'ricevute/r1', null, true);
  await atteso('fam', 'get', 'comunicazioni/c1', null, true); await atteso('fam', 'get', 'accessi/fam', null, true);
  await atteso('estraneo', 'get', 'atleti/a1', null, false); await atteso('estraneo', 'get', 'ricevute/r1', null, false);
  await atteso('mister', 'get', 'allenatori/mister', null, true); await atteso('mister', 'set', 'allenatori/mister', { categorie: ['X'] }, false);
  await atteso('fam', 'set', 'notifiche/fam', { email: true, aggiornatoIl: 'x' }, true);

  console.log(falliti ? 'Collaudo regole: ' + falliti + ' PROBLEMI su ' + n + ' controlli (vedi sopra).' : 'OK: ' + n + ' controlli sulle regole di Firestore (ruoli) con l\'emulatore.');
  process.exit(falliti ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
