import { render, screen } from '@testing-library/react-native';

import { Maglia, mancano, paginaVideo, youtubeId } from '~/components/home/Maglia';

// Moduli di Node solo per il test (l'app non ha i tipi di Node).
/* eslint-disable @typescript-eslint/no-require-imports */
declare const __dirname: string;
const fs = require('fs') as { readFileSync: (p: string, c: string) => string };
const path = require('path') as { join: (...p: string[]) => string };
/* eslint-enable @typescript-eslint/no-require-imports */

describe('nuova maglia (regole di js/pages/index-4.js)', () => {
  it('ID del video: stessi risultati di youtubeId() del sito', () => {
    const codice = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'js', 'pages', 'index-4.js'), 'utf8');
    const corpo = /function youtubeId\(url\) \{([\s\S]*?)\n {2}\}/.exec(codice)![1];
    const delSito = new Function('url', corpo) as (u: string) => string;
    for (const u of ['https://www.youtube.com/watch?v=TSGp37hHVJs', 'https://youtu.be/TSGp37hHVJs?t=3', 'https://www.youtube.com/watch?feature=x&v=TSGp37hHVJs',
      'https://www.youtube-nocookie.com/embed/TSGp37hHVJs', 'https://youtube.com/shorts/TSGp37hHVJs', 'TSGp37hHVJs', 'https://vimeo.com/123', '', 'abc']) {
      expect(youtubeId(u)).toBe(delSito(u));
    }
    expect(youtubeId('https://www.youtube.com/watch?v=TSGp37hHVJs')).toBe('TSGp37hHVJs');
  });

  it('conto alla rovescia: giorni, ore, minuti, secondi; tutto 00 dopo la data', () => {
    const t = new Date('2026-12-01T20:00:00').getTime();
    expect(mancano('2026-12-01T20:00:00', t - (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000)).toEqual({ giorni: '02', ore: '03', minuti: '04', secondi: '05', finito: false });
    expect(mancano('2026-12-01T20:00:00', t + 1000)).toEqual({ giorni: '00', ore: '00', minuti: '00', secondi: '00', finito: true });
    expect(mancano('', t)).toBeNull();
  });

  it('player come il sito: nocookie, muto, in loop, senza controlli', () => {
    const html = paginaVideo('TSGp37hHVJs', true);
    expect(html).toContain('https://www.youtube-nocookie.com/embed/TSGp37hHVJs?autoplay=1&rel=0&playsinline=1&enablejsapi=1');
    expect(html).toContain('&mute=1&loop=1&playlist=TSGp37hHVJs&controls=0');
    expect(paginaVideo('TSGp37hHVJs', false)).not.toContain('mute=1');
  });

  it('spenta: non si vede; senza video: In arrivo e conto; con video: sottotitolo e niente conto', async () => {
    const base = { enabled: true, title: 'NUOVA MAGLIA', subtitle: 'Stagione 26/27', revealDate: '2099-01-01T20:00:00', videoUrl: '' };
    const { toJSON, rerender } = await render(<Maglia maglia={{ ...base, enabled: false }} />);
    expect(toJSON()).toBeNull();
    await rerender(<Maglia maglia={base} />);
    expect(screen.getByText('In arrivo')).toBeTruthy();
    expect(screen.getByText('Giorni')).toBeTruthy();
    await rerender(<Maglia maglia={{ ...base, videoUrl: 'https://youtu.be/TSGp37hHVJs' }} />);
    expect(screen.getByText('Stagione 26/27')).toBeTruthy();
    expect(screen.queryByText('In arrivo')).toBeNull();
    expect(screen.queryByText('Giorni')).toBeNull();
    // Il player (WebView) c'e' quando il telefono non chiede di ridurre il movimento.
    expect(await screen.findByTestId('webview')).toBeTruthy();
    expect(screen.getByLabelText("Attiva l'audio")).toBeTruthy();
  });
});
