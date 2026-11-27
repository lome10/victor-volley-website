// Colori e font del sito (css/style.css). Il brand book usa tinte un po' diverse (docs/brandbook/BRANDBOOK.md):
// qui vale il sito, perche' l'app deve essere uguale al sito (Lorenzo, 26/11/2026).
export const colors = {
  navy: '#053063',
  azzurro: '#008CFD',
  azzurroScuro: '#0070D6',
  magenta: '#CB2168',
  bianco: '#FFFFFF',
  testo: '#1A1A1E',
  notte: '#020D1A',
  menu: '#021E3A',
} as const;

export const fonts = {
  titolo: 'Barlow_700Bold',
  /** Titoli a 800 del sito (font-weight 800: squadre, staff, schede). */
  titoloForte: 'Barlow_800ExtraBold',
  titoloMedio: 'Barlow_600SemiBold',
  corpo: 'Manrope_400Regular',
  corpoForte: 'Manrope_700Bold',
} as const;
