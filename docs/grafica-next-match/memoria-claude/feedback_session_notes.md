---
name: session-notes-aggiornamento
description: Mantenere session_notes.md nella root del repo aggiornato a ogni cambiamento e a fine sessione
metadata:
  node_type: memory
  type: feedback
  originSessionId: 49c2a030-722a-4861-b3f7-263704be049c
  modified: 2026-10-01T15:25:55.934Z
---

Nel repo esiste `session_notes.md` (root) con stato attuale, cose da fare, da verificare, decisioni e registro sessioni. L'utente vuole che lo aggiorni **a fine di ogni sessione e a ogni cambiamento** che facciamo, per poter seguire tutto.

**Why:** il lavoro è lungo e distribuito su più sessioni (monolite admin, migrazioni, audit): le note sono il punto di continuità.

**How to apply:** a inizio sessione leggi `session_notes.md`; dopo ogni modifica, commit o decisione aggiorna le sezioni interessate e la data "Ultimo aggiornamento"; a fine sessione aggiungi una voce al registro. Spunta `[x]` le voci completate. Vedi [[victor-volley-admin-monolite]].
