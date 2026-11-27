/* global jest */
// Prima di ogni file di test. Nessun test parla con Firebase vero: l'area atleti usa un Firebase finto
// (test/firebaseFinto.ts); il file vero si prova a parte in firebase.test.ts con i moduli firebase/* finti.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('~/lib/firebase', () => require('./test/firebaseFinto'));
// Nessun test parla con il sito vero: chi ha bisogno di fetch lo sostituisce con uno finto.
globalThis.fetch = () => Promise.reject(new Error('fetch vero vietato nei test: usa un fetch finto'));
