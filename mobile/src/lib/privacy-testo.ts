// Testo della pagina Privacy del sito (privacy.html), copiato parola per parola con uno script: non riscriverlo a mano.
// Se cambia privacy.html va rigenerato (VVW-42).
export type Pezzo = { t: string; b?: boolean; i?: boolean; code?: boolean; href?: string };
export type Blocco =
  | { tipo: 'aggiornato' | 'h2' | 'h3' | 'p' | 'riquadro'; testo: Pezzo[]; id?: string | null }
  | { tipo: 'ul'; voci: Pezzo[][] }
  | { tipo: 'tabella'; testa: Pezzo[][]; righe: Pezzo[][][] }
  | { tipo: 'tasto'; testo: string };

export const TESTATA = { briciola: 'Privacy e cookie', titolo: 'Privacy e cookie', sottotitolo: 'Come trattiamo i tuoi dati e cosa fa questo sito sul tuo dispositivo' };
/** Messaggio del sito dopo "Revoca" (js/pages/privacy-1.js). */
export const REVOCATO = '✓ Consenso revocato: la mappa tornerà a chiederti il permesso.';

export const BLOCCHI: Blocco[] = [
  {
    "tipo": "aggiornato",
    "testo": [
      {
        "t": "Ultimo aggiornamento: 6 ottobre 2026"
      }
    ]
  },
  {
    "tipo": "h2",
    "id": "titolare",
    "testo": [
      {
        "t": "1. Chi tratta i tuoi dati"
      }
    ]
  },
  {
    "tipo": "p",
    "testo": [
      {
        "t": "Il titolare del trattamento è "
      },
      {
        "b": true,
        "t": "ASD Victor Volley"
      },
      {
        "t": ", con sede legale in Via Indipendenza 48, Racale (LE). Per qualsiasi domanda sui tuoi dati, o per esercitare i tuoi diritti, scrivi a "
      },
      {
        "href": "mailto:victorvolley@libero.it",
        "t": "victorvolley@libero.it"
      },
      {
        "t": "."
      }
    ]
  },
  {
    "tipo": "h2",
    "id": "dati",
    "testo": [
      {
        "t": "2. Quali dati raccogliamo e perché"
      }
    ]
  },
  {
    "tipo": "h3",
    "id": null,
    "testo": [
      {
        "t": "Moduli del sito (Contatti, Unisciti a noi e Diventa partner)"
      }
    ]
  },
  {
    "tipo": "ul",
    "voci": [
      [
        {
          "b": true,
          "t": "Dati:"
        },
        {
          "t": " nome, cognome, email, telefono (facoltativo), età o data di nascita, categoria di interesse e il testo del messaggio; per il modulo Diventa partner, il nome dell’azienda e il livello di partnership di interesse."
        }
      ],
      [
        {
          "b": true,
          "t": "Finalità:"
        },
        {
          "t": " rispondere alla tua richiesta e, se lo desideri, organizzare una prova."
        }
      ],
      [
        {
          "b": true,
          "t": "Base giuridica:"
        },
        {
          "t": " il tuo consenso (la casella che spunti prima di inviare) e la richiesta di informazioni da parte tua (art. 6.1 lett. a e b GDPR)."
        }
      ],
      [
        {
          "b": true,
          "t": "Conservazione:"
        },
        {
          "t": " il tempo necessario a rispondere e, comunque, non oltre 5 anni dall’ultimo contatto, salvo che tu diventi tesserato."
        }
      ]
    ]
  },
  {
    "tipo": "p",
    "testo": [
      {
        "t": "Se i dati riguardano un minore, il modulo va compilato da un genitore o tutore. In Italia il minore può dare il consenso da solo solo dai 14 anni (art. 2-quinquies del Codice privacy)."
      }
    ]
  },
  {
    "tipo": "h3",
    "id": null,
    "testo": [
      {
        "t": "Atleti, famiglie e tesseramento (area riservata)"
      }
    ]
  },
  {
    "tipo": "ul",
    "voci": [
      [
        {
          "b": true,
          "t": "Dati:"
        },
        {
          "t": " anagrafica dell’atleta e dei genitori (nome, data di nascita, codice fiscale, indirizzo, contatti), presenze agli allenamenti, comunicazioni, quote e pagamenti (comprese le ricevute di pagamento, che riportano nome e codice fiscale di chi paga e dell’atleta, importo e causale), scadenza del certificato medico di idoneità sportiva. Per l’accesso: email e password (la password non è leggibile da noi)."
        }
      ],
      [
        {
          "b": true,
          "t": "Finalità:"
        },
        {
          "t": " gestire il tesseramento e l’attività sportiva, controllare la validità del certificato medico, comunicare con le famiglie, tenere la contabilità e rilasciare le ricevute dei pagamenti."
        }
      ],
      [
        {
          "b": true,
          "t": "Base giuridica:"
        },
        {
          "t": " esecuzione del rapporto associativo e obblighi di legge e federali (art. 6.1 lett. b e c GDPR)."
        }
      ],
      [
        {
          "b": true,
          "t": "Promemoria:"
        },
        {
          "t": " all’indirizzo email dell’accesso inviamo avvisi sulle scadenze di quote e certificato medico (di norma 7 e 1 giorno prima e, per le quote, dopo la scadenza). Sono comunicazioni legate al rapporto associativo: puoi disattivarle in qualsiasi momento da "
        },
        {
          "i": true,
          "t": "Il tuo account → Promemoria via email"
        },
        {
          "t": " o scrivendo a victorvolley@libero.it. Ne conserviamo il solo registro tecnico degli invii."
        }
      ],
      [
        {
          "b": true,
          "t": "Email di servizio:"
        },
        {
          "t": " quando creiamo un account inviamo un’email con il link per scegliere la password e, quando emettiamo una ricevuta di pagamento, ne inviamo il PDF in allegato ai genitori collegati all’atleta (o all’atleta stesso, se maggiorenne). Sono comunicazioni necessarie al rapporto associativo e non si possono disattivare; la ricevuta resta comunque disponibile anche nell’area atleti."
        }
      ],
      [
        {
          "b": true,
          "t": "Accesso:"
        },
        {
          "t": " solo i dirigenti autorizzati e, per i propri figli, i genitori, che possono anche scaricare dall’area atleti le ricevute dei pagamenti. I dati non sono pubblici."
        }
      ],
      [
        {
          "b": true,
          "t": "Conservazione:"
        },
        {
          "t": " per la durata del rapporto e, dopo, per i tempi richiesti da obblighi fiscali e federali. Le ricevute di pagamento sono documenti contabili: non si cancellano e vengono conservate per il periodo previsto dagli obblighi fiscali e contabili (in genere 10 anni), anche se l’atleta lascia l’associazione; in caso di errore vengono annullate, non eliminate."
        }
      ]
    ]
  },
  {
    "tipo": "h3",
    "id": null,
    "testo": [
      {
        "t": "Foto e video"
      }
    ]
  },
  {
    "tipo": "p",
    "testo": [
      {
        "t": "Le foto e i video di allenamenti, partite ed eventi pubblicati nella galleria e nelle news ritraggono atleti e dirigenti. Per i minori raccogliamo il consenso di un genitore o tutore con una liberatoria firmata su carta; ne conserviamo una copia scansionata finché le immagini restano pubblicate. Puoi chiedere in ogni momento la rimozione di un’immagine scrivendoci."
      }
    ]
  },
  {
    "tipo": "h3",
    "id": null,
    "testo": [
      {
        "t": "Dati di navigazione"
      }
    ]
  },
  {
    "tipo": "p",
    "testo": [
      {
        "t": "Per capire quante persone visitano il sito usiamo "
      },
      {
        "b": true,
        "t": "Vercel Web Analytics"
      },
      {
        "t": ", che lavora in forma aggregata, "
      },
      {
        "b": true,
        "t": "senza cookie"
      },
      {
        "t": " e senza identificare i singoli visitatori. Il fornitore del servizio di hosting registra inoltre, per ragioni di sicurezza e funzionamento, dati tecnici come l’indirizzo IP e la pagina richiesta."
      }
    ]
  },
  {
    "tipo": "h2",
    "id": "destinatari",
    "testo": [
      {
        "t": "3. Con chi condividiamo i dati"
      }
    ]
  },
  {
    "tipo": "p",
    "testo": [
      {
        "t": "Non vendiamo i dati. Per far funzionare il sito ci affidiamo a fornitori che li trattano per nostro conto:"
      }
    ]
  },
  {
    "tipo": "tabella",
    "testa": [
      [
        {
          "t": "Fornitore"
        }
      ],
      [
        {
          "t": "A cosa serve"
        }
      ]
    ],
    "righe": [
      [
        [
          {
            "t": "Vercel Inc."
          }
        ],
        [
          {
            "t": "Hosting del sito e statistiche di visita senza cookie"
          }
        ]
      ],
      [
        [
          {
            "t": "Google Firebase"
          }
        ],
        [
          {
            "t": "Database dei contenuti e dell’area riservata, accesso con email e password"
          }
        ]
      ],
      [
        [
          {
            "t": "Web3Forms"
          }
        ],
        [
          {
            "t": "Recapito via email dei messaggi inviati dai moduli"
          }
        ]
      ],
      [
        [
          {
            "t": "Cloudinary"
          }
        ],
        [
          {
            "t": "Archiviazione e consegna di immagini e loghi"
          }
        ]
      ],
      [
        [
          {
            "t": "Brevo (Sendinblue SAS, Francia)"
          }
        ],
        [
          {
            "t": "Invio delle email ai genitori e agli atleti con un accesso all’area atleti: promemoria sulle scadenze di quote e certificato medico, invito a scegliere la password, ricevute di pagamento in PDF"
          }
        ]
      ]
    ]
  },
  {
    "tipo": "p",
    "testo": [
      {
        "t": "Alcuni di questi fornitori hanno sede negli Stati Uniti: il trasferimento avviene con le garanzie previste dal GDPR (decisione di adeguatezza o clausole contrattuali standard)."
      }
    ]
  },
  {
    "tipo": "h2",
    "id": "cookie",
    "testo": [
      {
        "t": "4. Cookie e tecnologie simili"
      }
    ]
  },
  {
    "tipo": "riquadro",
    "testo": [
      {
        "b": true,
        "t": "In sintesi:"
      },
      {
        "t": " questo sito non usa cookie di profilazione né pubblicitari. Per questo non c’è un banner dei cookie. La mappa di Google, che può impostare cookie propri, parte solo dopo che premi «Carica». Il video di YouTube nella pagina Diretta si carica invece subito, e YouTube può impostare cookie propri."
      }
    ]
  },
  {
    "tipo": "h3",
    "id": null,
    "testo": [
      {
        "t": "Salvataggio tecnico sul tuo dispositivo"
      }
    ]
  },
  {
    "tipo": "p",
    "testo": [
      {
        "t": "Sono necessari al funzionamento e non richiedono consenso. Non vengono inviati a terzi."
      }
    ]
  },
  {
    "tipo": "tabella",
    "testa": [
      [
        {
          "t": "Nome"
        }
      ],
      [
        {
          "t": "A cosa serve"
        }
      ],
      [
        {
          "t": "Durata"
        }
      ]
    ],
    "righe": [
      [
        [
          {
            "code": true,
            "t": "vv_splash_shown"
          }
        ],
        [
          {
            "t": "Ricorda che hai già visto l’animazione di apertura"
          }
        ],
        [
          {
            "t": "Finché chiudi la scheda"
          }
        ]
      ],
      [
        [
          {
            "code": true,
            "t": "vv_nav_id"
          }
        ],
        [
          {
            "t": "Apre l’articolo giusto quando passi da una pagina all’altra"
          }
        ],
        [
          {
            "t": "Finché chiudi la scheda"
          }
        ]
      ],
      [
        [
          {
            "t": "Accesso area riservata"
          }
        ],
        [
          {
            "t": "Mantiene la sessione di chi ha effettuato il login (Firebase)"
          }
        ],
        [
          {
            "t": "Fino al logout"
          }
        ]
      ],
      [
        [
          {
            "t": "Ultimo accesso area riservata"
          }
        ],
        [
          {
            "t": "Segna le comunicazioni già lette"
          }
        ],
        [
          {
            "t": "Finché non lo cancelli"
          }
        ]
      ],
      [
        [
          {
            "code": true,
            "t": "vv_embed_consent"
          }
        ],
        [
          {
            "t": "Ricorda la scelta «Carica sempre» per la mappa di Google"
          }
        ],
        [
          {
            "t": "Finché non la revochi"
          }
        ]
      ]
    ]
  },
  {
    "tipo": "h3",
    "id": null,
    "testo": [
      {
        "t": "Contenuti di terze parti"
      }
    ]
  },
  {
    "tipo": "ul",
    "voci": [
      [
        {
          "b": true,
          "t": "Google Maps"
        },
        {
          "t": " (pagina Contatti): la mappa non viene caricata finché non premi «Carica». Dopo il tuo consenso, Google può impostare cookie e raccogliere dati secondo la "
        },
        {
          "href": "https://policies.google.com/privacy",
          "t": "propria informativa"
        },
        {
          "t": "."
        }
      ],
      [
        {
          "b": true,
          "t": "YouTube"
        },
        {
          "t": " (pagina Diretta): il video della partita in diretta, o l’ultimo video del canale, si carica insieme alla pagina. YouTube può impostare cookie e raccogliere dati, come previsto dalla "
        },
        {
          "href": "https://policies.google.com/privacy",
          "t": "propria informativa"
        },
        {
          "t": "."
        }
      ],
      [
        {
          "b": true,
          "t": "Video di presentazione nella home:"
        },
        {
          "t": " usa la modalità a privacy avanzata di YouTube ("
        },
        {
          "code": true,
          "t": "youtube-nocookie.com"
        },
        {
          "t": "), che non imposta cookie di tracciamento finché non interagisci con il video."
        }
      ],
      [
        {
          "b": true,
          "t": "Tabellone della partita in diretta:"
        },
        {
          "t": " è fornito da un servizio esterno (Set Point Pulse) e appare solo durante una partita live; il servizio riceve il tuo indirizzo IP."
        }
      ]
    ]
  },
  {
    "tipo": "h3",
    "id": null,
    "testo": [
      {
        "t": "Gestisci le tue scelte"
      }
    ]
  },
  {
    "tipo": "p",
    "testo": [
      {
        "t": "Se per la mappa di Google hai scelto «Carica sempre», puoi tornare indietro qui:"
      }
    ]
  },
  {
    "tipo": "tasto",
    "testo": "Revoca il consenso alla mappa"
  },
  {
    "tipo": "p",
    "testo": [
      {
        "t": "Puoi inoltre cancellare i dati salvati dal sito dalle impostazioni del tuo browser."
      }
    ]
  },
  {
    "tipo": "h2",
    "id": "diritti",
    "testo": [
      {
        "t": "5. I tuoi diritti"
      }
    ]
  },
  {
    "tipo": "p",
    "testo": [
      {
        "t": "Puoi chiederci in ogni momento di accedere ai tuoi dati, correggerli, cancellarli, limitarne il trattamento, riceverli in un formato leggibile (portabilità) e opporti al trattamento. Dove il trattamento si basa sul consenso, puoi revocarlo quando vuoi, senza effetto sul passato. Scrivi a "
      },
      {
        "href": "mailto:victorvolley@libero.it",
        "t": "victorvolley@libero.it"
      },
      {
        "t": ": rispondiamo entro un mese."
      }
    ]
  },
  {
    "tipo": "p",
    "testo": [
      {
        "t": "Se ritieni che i tuoi dati non siano trattati correttamente, puoi presentare reclamo al "
      },
      {
        "href": "https://www.garanteprivacy.it",
        "t": "Garante per la protezione dei dati personali"
      },
      {
        "t": "."
      }
    ]
  },
  {
    "tipo": "h2",
    "id": "modifiche",
    "testo": [
      {
        "t": "6. Aggiornamenti"
      }
    ]
  },
  {
    "tipo": "p",
    "testo": [
      {
        "t": "Se cambiamo il modo in cui trattiamo i dati, aggiorniamo questa pagina e la data in alto."
      }
    ]
  }
];
