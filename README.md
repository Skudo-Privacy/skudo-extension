# Skudo browser extension

Crea un alias email invece di dare il proprio indirizzo vero.

Stato: **si carica e funziona**. Rilevamento, contesto di sfondo, content
script e popup sono scritti e provati. Il token ad ambito ristretto c'è, con
scadenza e revoca. Manca la pubblicazione sugli store.

## Perché non è un fork

L'estensione di addy.io è MIT e la nostra API è compatibile al 100%: puntata su
`app.skudo.org` con un token, funziona oggi. Ma delle sue 4.728 righe, 3.854
sono un unico componente Vue che va riscritto comunque, e altre due scelte non
sono spedibili per noi: la chiave API finisce in `storage.sync`, cioè sui server
di Google o Mozilla, e il content script chiede `<all_urls>` all'installazione.

Quello che vale la pena tenere sono circa 400 righe di conoscenza sui campi, che
qui è portata e citata in [NOTICE.md](NOTICE.md).

## Cosa fa di diverso

**Distingue un modulo di iscrizione da uno di accesso.** Nessuna delle
estensioni per alias in circolazione lo fa: addy.io, SimpleLogin e Firefox Relay
mettono il proprio pulsante su ogni campo email che trovano. Su un accesso
l'alias nuovo è dannoso: l'utente lo inserisce, non entra, e si ritrova un
indirizzo da cancellare. Qui su un accesso si propone l'alias che già esiste per
quel dominio.

**Ha un corpus di prova.** Nessuna delle tre ha test di rilevamento. Le
euristiche peggiorano da sole: si aggiunge un'esclusione per un sito e se ne
rompono due che nessuno riprova.

## Il rilevatore

Cinque strati, in ordine. Si scarta prima di misurare, perché un falso positivo
costa più di un falso negativo: se non troviamo un campo l'utente copia l'alias
a mano, se ne infiliamo uno nella casella di ricerca abbiamo rotto la pagina di
qualcun altro.

| | | |
|---|---|---|
| 0 | esclusione | `exclusions.js` |
| 1 | certezza, quando è il sito a dircelo | `index.js` |
| 2 | punteggio sui segnali | `signals.js` |
| 3 | intento del modulo | `form-intent.js` |
| 4 | sanità fisica | `visibility.js` |

I pesi dello strato 2 marcati `calibrated: true` sono quelli appresi da Mozilla e
riportati alla cifra. Il risultato più interessante di quel modello è
controintuitivo: il segnale più forte non è nessun attributo dell'input, è il
testo della `<label>` associata.

Gli altri sono nostri, messi a mano, e vanno rifatti con una regressione quando
il corpus sarà fatto di catture reali invece che di moduli scritti a mano sui
modelli ricorrenti.

## Peso

Il content script viene caricato su ogni pagina che l'utente apre, quindi il
peso è un requisito e non un dettaglio.

```
background.js    9.2 KB
content.js      19.4 KB
popup.js         8.0 KB
connect.js       1.7 KB
```

Il pacchetto intero sta in 80 KB, contro alcune centinaia delle estensioni
equivalenti. Le tre scelte che lo permettono: niente `webextension-polyfill`
(30 KB, non più necessario da Manifest V3), niente libreria Fathom (2.739 righe
per quattro segnali), niente `psl` (100 KB per ricavare il nome di un dominio).

## Comandi

```
npm install
npm test          # 79 prove
npm run build     # produce dist/
npm run dev       # ricostruisce a ogni salvataggio
npm run format
```

Per caricarla in un browser: vedi [docs/BROWSERS.md](docs/BROWSERS.md).

## Un sito, un alias

Premere l'icona due volte non crea due indirizzi. Il primo alias dato a un sito
resta quello per tutta la sessione del browser, e per averne un altro bisogna
chiederlo dal pannello. Senza questa regola un modulo con due campi, o una
persona che ripreme perché non ha visto il pannello, produce quattro o cinque
alias per una sola iscrizione, e poi non c'è modo di sapere quale ha ricevuto
davvero il sito.

## Non si scavalca chi c'era prima

Bitwarden, Proton Pass, 1Password e noi mettiamo l'icona nello stesso angolo del
campo, e quella sotto non riceve nemmeno i clic. Non si vince alzando lo
z-index: si guarda cosa c'è in quel punto e ci si sposta. Vedi
`src/content/anchor.js`, che copre anche i due modi di occupare l'angolo che non
lasciano un elemento da trovare.

## Cosa manca

- **Catture reali** nel corpus, per calibrare i pesi messi a mano.
- **Prova sui browser veri**, Mullvad Browser e LibreWolf compresi.
- **Pubblicazione** sugli store, e la costruzione riproducibile che la
  accompagna. Vedi [docs/SECURITY.md](docs/SECURITY.md).

## Documenti

- [docs/SECURITY.md](docs/SECURITY.md), cosa protegge e cosa no
- [docs/BROWSERS.md](docs/BROWSERS.md), i quattro browser
- [NOTICE.md](NOTICE.md), da dove viene il lavoro derivato
