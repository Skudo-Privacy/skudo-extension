# Attribuzioni

Questo progetto contiene lavoro derivato da tre estensioni libere. Nessuna delle
tre licenze ci obbliga a pubblicare il nostro codice; tutte richiedono che
l'avviso di copyright accompagni il pacchetto distribuito.

## Firefox Relay — Mozilla Public License 2.0

<https://github.com/mozilla/fx-private-relay-add-on>

I pesi del modello di rilevamento in `src/detector/signals.js`
(`attrsMatchEmailExactly`, `placeholderMatchesEmail`, `labelMatchesEmail` e la
costante di partenza) sono quelli appresi dal modello Fathom di Mozilla,
addestrato su un insieme di moduli reali etichettati a mano. Sono riportati alla
cifra. La libreria Fathom non è inclusa: la somma pesata e la sigmoide sono
riscritte, perché 2.739 righe di libreria per quattro segnali non si giustificano.

## DuckDuckGo Autofill — Apache License 2.0

<https://github.com/duckduckgo/duckduckgo-autofill>

Le esclusioni in `src/detector/exclusions.js` ricalcano quelle della loro
configurazione di riconoscimento campi: caselle di ricerca, filtri, campi
"oggetto", codici sconto. L'impostazione a punteggio con segno di
`src/detector/form-intent.js`, con il testo del pulsante di invio come segnale
dominante, viene dal loro `FormAnalyzer.js`. Il codice è riscritto, i pesi sono
nostri.

## addy.io browser extension — MIT

<https://github.com/anonaddy/browser-extension>

Copyright (c) 2019 addy.io

Le soglie di dimensione minima contro i campi trappola e il criterio di
posizionamento dell'icona derivano dalla loro `content.js`.

---

I file di licenza per esteso vanno inclusi in `dist/` prima della pubblicazione
sugli store.
