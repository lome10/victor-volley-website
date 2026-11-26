import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { menu, tutte } from '~/lib/pagine';

describe('menu come il sito', () => {
  it('ha le voci del sito, nello stesso ordine', () => {
    expect(menu.map((p) => p.menu)).toEqual(['Home', 'Diretta', 'Squadre', 'Stagione', 'News', 'Galleria', 'Partner', 'Contatti']);
  });

  it('apre dal menu e passa da una pagina all\'altra', async () => {
    await renderRouter('./src/app');
    await fireEvent.press(screen.getByRole('button', { name: 'Apri menu' }));
    await fireEvent.press(screen.getByLabelText('Stagione'));
    expect(screen).toHavePathname('/calendario');
    await fireEvent.press(screen.getByRole('button', { name: 'Apri menu' }));
    await fireEvent.press(screen.getByLabelText('Partner'));
    expect(screen).toHavePathname('/sponsor');
    await fireEvent.press(screen.getByRole('button', { name: 'Guarda la diretta' }));
    expect(screen).toHavePathname('/diretta');
    await fireEvent.press(screen.getByLabelText('Victor Volley, home'));
    expect(screen).toHavePathname('/');
  }, 60000);

  it.each(tutte.filter((p) => p.href !== '/news').map((p) => [p.href as string, p.titolo]))('la pagina %s si apre col suo titolo', async (href, titolo) => {
    await renderRouter('./src/app', { initialUrl: href });
    expect(screen.getByRole('header', { name: titolo })).toBeTruthy();
  }, 60000);
});
