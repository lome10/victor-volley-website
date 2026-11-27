// PDF da un documento HTML (riepilogo quote, ricevute). Sul telefono: expo-print crea il PDF, poi "Condividi"
// (salva in File, invia, stampa). Sul web: come il sito, una finestra con il documento e la stampa ("Salva come PDF").
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export class FinestraBloccata extends Error {}

export async function condividiPdf(html: string, nomeFile: string) {
  if (Platform.OS === 'web') {
    const w = window.open('', '_blank');
    if (!w) throw new FinestraBloccata('popup bloccato');
    w.document.open();
    w.document.write(html);
    w.document.close();
    // il logo deve essere caricato prima della stampa
    setTimeout(() => {
      w.focus();
      w.print();
    }, 700);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  // Il file di expo-print ha un nome casuale: una copia col nome giusto, che e' quello che vede chi lo salva.
  const destinazione = new File(Paths.cache, nomeFile);
  if (destinazione.exists) destinazione.delete();
  new File(uri).copy(destinazione);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Condivisione non disponibile');
  await Sharing.shareAsync(destinazione.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: nomeFile });
}
