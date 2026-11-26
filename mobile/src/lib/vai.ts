// Navigazione dal menu: la Home resta sempre sotto, cosi' la pila non cresce e "indietro" torna alla Home.
import { router, type Href } from 'expo-router';

export function vai(href: Href, attuale: string) {
  if (href === attuale) return;
  if (href === '/') router.dismissTo('/');
  else if (attuale === '/') router.push(href);
  else router.replace(href);
}
