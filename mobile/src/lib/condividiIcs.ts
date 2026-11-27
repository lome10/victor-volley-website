// "Aggiungi tutte al calendario": sul sito scarica un .ics; nell'app lo salva nella cache e apre "Condividi",
// da cui si sceglie Calendario (iPhone) o l'app calendario (Android). Sul web scarica il file come il sito.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function condividiIcs(testo: string, nomeFile: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([testo], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeFile;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    return;
  }
  const file = new File(Paths.cache, nomeFile);
  if (file.exists) file.delete();
  file.create();
  await file.write(testo);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Condivisione non disponibile');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', UTI: 'public.calendar-event', dialogTitle: 'Aggiungi al calendario' });
}
