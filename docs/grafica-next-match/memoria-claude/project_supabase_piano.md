---
name: project-supabase-piano
description: "Migrazione Firestore→Supabase: solo piano scritto (docs/PIANO_MIGRAZIONE_SUPABASE.md), non applicato; si resta su Firestore"
metadata:
  node_type: memory
  type: project
  originSessionId: d91d1510-fd17-42f9-a0e7-b044852d39a5
  modified: 2026-10-14T08:42:54.092Z
---

Il 2026-10-14 l'utente ha chiesto una migrazione di tutto Firestore a Supabase, poi ha deciso di **restare su Firestore per ora** e di avere solo il piano scritto in `docs/PIANO_MIGRAZIONE_SUPABASE.md`, senza applicarlo.

**Why:** il motivo era il superamento delle 50K letture/giorno del 13/10; la console Firebase mostra 297K letture in 30 giorni (~10K/giorno) e un solo giorno sopra il limite (picco da lavoro sull'admin, non traffico pubblico). Supabase era già stato rimosso dal sito il 2026-10-04 (mai configurato).

**How to apply:** non iniziare la migrazione senza una nuova richiesta esplicita. Se riemerge il problema quota, proporre prima la cache dei dati pubblici e/o Blaze con tetto di spesa, e ricontrollare la console. Vedi [[feedback-usa-chrome-per-console]].
