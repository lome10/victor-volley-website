// Il file vero ~/lib/firebase, con i moduli firebase/* finti: controlla che le query e le due scritture
// siano quelle che firestore.rules accetta. Nessuna rete, nessun account.
jest.unmock('~/lib/firebase');

const mockChiamate: unknown[][] = [];
const mockRegistra =
  (nome: string, risposta?: (...a: unknown[]) => unknown) =>
  (...a: unknown[]) => {
    mockChiamate.push([nome, ...a]);
    return risposta ? risposta(...a) : { nome, a };
  };

const mockDocumenti: Record<string, { id: string; data: Record<string, unknown> }[]> = {};
const mockSingoli: Record<string, Record<string, unknown> | undefined> = {};
const mockFallisce = { query: false, doc: false };

jest.mock('firebase/app', () => ({
  getApps: () => [],
  getApp: () => ({}),
  initializeApp: mockRegistra('initializeApp', () => ({ app: true })),
}));

const mockUtente = { uid: 'u1', email: 'a@b.it' };
const mockReauth = jest.fn();
const mockNuovaPassword = jest.fn();
jest.mock('firebase/auth', () => ({
  getAuth: mockRegistra('getAuth', () => ({ currentUser: mockUtente })),
  initializeAuth: mockRegistra('initializeAuth', () => ({ currentUser: mockUtente })),
  getReactNativePersistence: (s: unknown) => ({ persistenza: s }),
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => {
    cb(mockUtente);
    return () => {};
  },
  signInWithEmailAndPassword: jest.fn(async (_a: unknown, email: string) => {
    if (email !== 'a@b.it') throw Object.assign(new Error('no'), { code: 'auth/invalid-credential' });
  }),
  signOut: jest.fn(async () => {}),
  EmailAuthProvider: { credential: (email: string, pwd: string) => ({ email, pwd }) },
  reauthenticateWithCredential: (...a: unknown[]) => mockReauth(...a),
  updatePassword: (...a: unknown[]) => mockNuovaPassword(...a),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: () => 'DB',
  collection: (_db: unknown, nome: string) => ({ collezione: nome }),
  where: (campo: string, op: string, valore: unknown) => ({ campo, op, valore }),
  query: (c: { collezione: string }, w: { campo: string; op: string; valore: unknown }) => ({ ...c, ...w }),
  doc: (_db: unknown, collezione: string, id: string) => ({ collezione, id }),
  getDocs: jest.fn(async (q: { collezione: string; campo: string; op: string; valore: unknown }) => {
    mockChiamate.push(['getDocs', q]);
    if (mockFallisce.query) throw new Error('permesso negato');
    return { docs: (mockDocumenti[q.collezione] ?? []).map((d) => ({ id: d.id, data: () => d.data })) };
  }),
  getDoc: jest.fn(async (r: { collezione: string; id: string }) => {
    mockChiamate.push(['getDoc', r]);
    if (mockFallisce.doc) throw new Error('permesso negato');
    const d = mockSingoli[r.collezione + '/' + r.id];
    return { id: r.id, exists: () => !!d, data: () => d };
  }),
  setDoc: jest.fn(async (r: unknown, dati: unknown) => {
    mockChiamate.push(['setDoc', r, dati]);
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fb = require('~/lib/firebase') as typeof import('~/lib/firebase');

beforeEach(() => {
  mockChiamate.length = 0;
  for (const k of Object.keys(mockDocumenti)) delete mockDocumenti[k];
  for (const k of Object.keys(mockSingoli)) delete mockSingoli[k];
  mockFallisce.query = false;
  mockFallisce.doc = false;
});

describe('~/lib/firebase', () => {
  it('sul telefono la sessione si salva in AsyncStorage', () => {
    fb.auth();
    const init = mockChiamate.find((c) => c[0] === 'initializeAuth');
    expect(init).toBeTruthy();
    expect((init![2] as { persistence: { persistenza: unknown } }).persistence.persistenza).toBeTruthy();
    expect(mockChiamate.find((c) => c[0] === 'initializeApp')![1]).toMatchObject({ projectId: 'victor-volley', authDomain: 'victor-volley.firebaseapp.com' });
  });

  it('accesso: true se riesce, false con qualsiasi errore; seguiUtente passa uid ed email', async () => {
    expect(await fb.accedi('a@b.it', 'x')).toBe(true);
    expect(await fb.accedi('c@d.it', 'x')).toBe(false);
    const visti: unknown[] = [];
    fb.seguiUtente((u) => visti.push(u));
    expect(visti).toEqual([{ uid: 'u1', email: 'a@b.it' }]);
  });

  it('schede: accessUids contiene l\'uid, piu\' atleti/{uid}; un errore non blocca l\'altra', async () => {
    mockDocumenti.atleti = [{ id: 'atl1', data: { nome: 'Sara', accessUids: ['u1'] } }];
    mockSingoli['atleti/u1'] = { nome: 'Vecchia' };
    const r = await fb.leggiSchede('u1');
    expect(mockChiamate).toContainEqual(['getDocs', { collezione: 'atleti', campo: 'accessUids', op: 'array-contains', valore: 'u1' }]);
    expect(mockChiamate).toContainEqual(['getDoc', { collezione: 'atleti', id: 'u1' }]);
    expect(r).toEqual({ conAccesso: [{ uid: 'atl1', nome: 'Sara', accessUids: ['u1'] }], propria: { uid: 'u1', nome: 'Vecchia' }, errore: false });

    mockFallisce.doc = true;
    expect(await fb.leggiSchede('u1')).toEqual({ conAccesso: [{ uid: 'atl1', nome: 'Sara', accessUids: ['u1'] }], propria: null, errore: true });
  });

  it('avvisi, rate e presenze con le stesse query del sito', async () => {
    mockDocumenti.comunicazioni = [{ id: 'c1', data: { titolo: 'T', categoria: 'tutte' } }];
    mockDocumenti.presenze = [{ id: 'p-1_atl1', data: { eventKey: 'p-1', risposta: 'si' } }];
    expect(await fb.leggiAvvisi(['tutte', 'Under 13'])).toEqual([{ id: 'c1', titolo: 'T', categoria: 'tutte' }]);
    await fb.leggiRate('atl1');
    expect(await fb.leggiPresenze('atl1')).toEqual({ 'p-1': 'si' });
    expect(mockChiamate.filter((c) => c[0] === 'getDocs').map((c) => c[1])).toEqual([
      { collezione: 'comunicazioni', campo: 'categoria', op: 'in', valore: ['tutte', 'Under 13'] },
      { collezione: 'rateAtleti', campo: 'atletaId', op: '==', valore: 'atl1' },
      { collezione: 'presenze', campo: 'atletaId', op: '==', valore: 'atl1' },
    ]);
  });

  it('presenza: id eventKey_atletaId ed ESATTAMENTE i 9 campi delle regole', async () => {
    const ev = { key: 'a-7-2026-12-01', tipo: 'allenamento' as const, eventoId: '7', date: '2026-12-01' };
    const { id, dati } = fb.documentoPresenza(ev, { uid: 'atl1', categoria: 'Under 13' }, 'no', 'u1', new Date('2026-11-27T10:00:00.000Z'));
    expect(id).toBe('a-7-2026-12-01_atl1');
    expect(Object.keys(dati).sort()).toEqual(['atletaId', 'categoria', 'data', 'eventKey', 'eventoId', 'risposta', 'rispostaDa', 'rispostaIl', 'tipo']);
    expect(dati).toEqual({
      eventKey: 'a-7-2026-12-01',
      tipo: 'allenamento',
      eventoId: '7',
      data: '2026-12-01',
      categoria: 'Under 13',
      atletaId: 'atl1',
      risposta: 'no',
      rispostaDa: 'u1',
      rispostaIl: '2026-11-27T10:00:00.000Z',
    });
    await fb.salvaPresenza(ev, { uid: 'atl1', categoria: 'Under 13' }, 'si', 'u1');
    const scritta = mockChiamate.find((c) => c[0] === 'setDoc')!;
    expect(scritta[1]).toEqual({ collezione: 'presenze', id: 'a-7-2026-12-01_atl1' });
    expect((scritta[2] as { risposta: string }).risposta).toBe('si');
  });

  it('promemoria: attivi se manca il documento; si salvano solo email e aggiornatoIl', async () => {
    expect(await fb.leggiPromemoria('u1')).toBe(true);
    mockSingoli['notifiche/u1'] = { email: false };
    expect(await fb.leggiPromemoria('u1')).toBe(false);
    await fb.salvaPromemoria('u1', true);
    const scritta = mockChiamate.find((c) => c[0] === 'setDoc')!;
    expect(scritta[1]).toEqual({ collezione: 'notifiche', id: 'u1' });
    expect(Object.keys(scritta[2] as object).sort()).toEqual(['aggiornatoIl', 'email']);
  });

  it('cambio password: prima la password attuale, messaggi del sito', async () => {
    mockReauth.mockResolvedValueOnce(undefined);
    mockNuovaPassword.mockResolvedValueOnce(undefined);
    expect(await fb.cambiaPassword('vecchia', 'nuova-nuova')).toEqual({ ok: true, messaggio: 'Password aggiornata.' });
    expect(mockReauth.mock.calls[0][1]).toEqual({ email: 'a@b.it', pwd: 'vecchia' });
    expect(mockNuovaPassword.mock.calls[0][1]).toBe('nuova-nuova');
    for (const [code, messaggio] of [
      ['auth/wrong-password', 'La password attuale non è corretta.'],
      ['auth/invalid-credential', 'La password attuale non è corretta.'],
      ['auth/too-many-requests', 'Troppi tentativi. Riprova tra qualche minuto.'],
      ['auth/weak-password', 'La nuova password è troppo debole.'],
      ['auth/altro', 'Non è stato possibile aggiornare la password. Riprova.'],
    ]) {
      mockReauth.mockRejectedValueOnce(Object.assign(new Error('x'), { code }));
      expect(await fb.cambiaPassword('a', 'b')).toEqual({ ok: false, messaggio });
    }
  });
});
