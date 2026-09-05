# Skudo browser extension

Crea un alias email invece di dare il proprio indirizzo vero.

Stato: **si carica e funziona**. Rilevamento, contesto di sfondo, content
script e popup sono scritti e provati; mancano il token ad ambito ristretto
lato server e la pubblicazione sugli store.

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
l'alias nuovo è dannoso — l'utente lo inserisce, non entra, e si ritrova un
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
background.js    6.0 KB
content.js      10.6 KB
popup.js         4.6 KB
```

Il pacchetto intero sta in 80 KB, contro alcune centinaia delle estensioni
equivalenti. Le tre scelte che lo permettono: niente `webextension-polyfill`
(30 KB, non più necessario da Manifest V3), niente libreria Fathom (2.739 righe
per quattro segnali), niente `psl` (100 KB per ricavare il nome di un dominio).

## Comandi

```
npm install
npm test          # 62 prove
npm run build     # produce dist/
npm run dev       # ricostruisce a ogni salvataggio
npm run format
```

Per caricarla in un browser: vedi [docs/BROWSERS.md](docs/BROWSERS.md).

## Cosa manca

- **Token ad ambito ristretto**, lato Skudo. Oggi l'estensione usa un token
  Sanctum pieno: chi riesce a leggerlo può cancellare l'account. Va aggiunto un
  tipo di token che possa solo creare e leggere alias.
- **Catture reali** nel corpus, per calibrare i pesi messi a mano.
- **Prova sui browser veri**, Mullvad Browser e LibreWolf compresi.
- **Pubblicazione** sugli store.

## Documenti

- [docs/BROWSERS.md](docs/BROWSERS.md) — Firefox, Mullvad Browser, LibreWolf, Chrome
- [NOTICE.md](NOTICE.md) — da dove viene il lavoro derivato
