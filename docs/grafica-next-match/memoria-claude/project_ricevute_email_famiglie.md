---
name: project-ricevute-email-famiglie
description: "Stato 2026-10-06 di ricevute di pagamento, area famiglie e promemoria email (Brevo in pausa per le credenziali Aruba); decisioni non ricavabili dal codice"
metadata:
  node_type: memory
  type: project
  originSessionId: d9b2f0ee-45b1-4e2c-87df-c617a71970a0
  modified: 2026-10-07T08:09:04.642Z
---

Ricevute di pagamento, area atleti per le famiglie e promemoria sono implementati e pubblicati su origin/main (ultimo commit di codice `ddadf15`, 2026-10-06). Dettagli e passi esatti in `session_notes.md` del repo («Da dove ripartire»).

Decisioni dell'utente (non ovvie dal codice):
- Ricevute: importo libero (una ricevuta può coprire più rate o nessuna), numero `AAAA/NNNN` da 2026/0001 (le 3 del file Excel erano di prova), anche per altri incassi, generabili solo dai dirigenti, scaricabili dalle famiglie in qualsiasi momento. Impaginazione identica al foglio «Ricevuta» del modello Excel; importo in lettere nel PDF; presidente «Cuna Matteo» con la sua firma (immagine PNG privata in `firme/presidente`, caricata dall'utente da Ricevute → Dati ASD). Il commercialista (un dirigente) ha validato testo, bollo (esente art. 27-bis se RASD) e conservazione.
- Nessun codice fiscale dell'ASD nel codice: lo inserisce la società in «Dati ASD».
- Password: minimo 10 caratteri, «Genera password» (14 caratteri casuali), le famiglie la cambiano quando vogliono (non forzato).
- Notifiche: scelti tutti e tre i canali, a fasi (in-app già c'è; email con **Brevo** perché UE; push FCM dopo). Soglie approvate: rate 7 e 1 giorno prima e poi 1/8/15/22 dopo; certificato 30/7/0.

**Why:** l'utente sta mettendo in produzione l'area famiglie con email ufficiali dal 2026-10-06.

**How to apply:** lo stato dei job email è «inattivo finché mancano le variabili su Vercel»; riprendere dai 4 record DNS di Brevo da inserire su Aruba (l'utente aveva perso le credenziali). Aggiornamento 2026-10-07: l'utente ha confermato che email promemoria, invito password e ricevuta PDF di esempio arrivano regolarmente (Brevo è attivo). Non dare per provate: ricevute con un account famiglia reale, area atleti su un telefono vero. [[victor-volley-admin-monolite]]

**Aggiornamento 2026-10-13:** l'utente conferma che i punti in sospeso su email/Brevo sono chiusi. Brevo è attivo: oggi esiste anche un'email di conferma dopo la scelta della password (`api/imposta-password.js`), adattata a più figli. Area famiglie: avviso fisso con IBAN in Avvisi, modulo di tesseramento scaricabile in Documenti (file in `assets/`). Dettagli in `session_notes.md`.
