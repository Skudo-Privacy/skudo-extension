/**
 * I valori del sistema visivo, in un posto solo.
 *
 * Il popup e il menu iniettato nelle pagine sono due contesti diversi, con due
 * fogli di stile diversi, e finora avevano due copie degli stessi colori.
 * Bastava cambiarne una per avere un prodotto che sembra due prodotti.
 *
 * ## Cosa e' stato tolto, e perche'
 *
 * Le interfacce generate a macchina si somigliano tutte, e i modi in cui si
 * somigliano sono catalogati. Questa ne aveva tre, e sono stati tolti:
 *
 *   1. **Il carattere era Inter.** E' il carattere che ha qualunque cosa
 *      generata: sceglierlo non e' una scelta, e' il valore predefinito del
 *      mondo. Qui c'e' IBM Plex, che ha terminali piatti, una `g` a occhiello
 *      singolo e una `a` che si riconosce da lontano. E' un carattere da
 *      infrastruttura, che e' quello che questo prodotto e'.
 *
 *   2. **Tutto aveva lo stesso raggio e la stessa ombra.** Quando ogni cosa e'
 *      una scheda arrotondata uguale a tutte le altre, non c'e' nessuna
 *      gerarchia: la morbidezza uniforme non e' uno stile, e' l'assenza di un
 *      sistema. Qui i raggi sono tre e fanno tre mestieri diversi, elencati
 *      sotto.
 *
 *   3. **C'era una sfumatura decorativa in cima a ogni superficie.** Non
 *      diceva niente. Una decorazione che non codifica niente e' la prima cosa
 *      da togliere.
 *
 * ## I tre raggi
 *
 * `--radius` sta sulle poche cose che devono sembrare oggetti staccati dal
 * fondo: il menu che galleggia sopra una pagina, il blocco dell'indirizzo.
 * `--radius-sm` sta sui comandi, che sono piu' piccoli di quello che
 * contengono. `--radius-xs` sui bersagli minuti. Un elenco non usa nessuno dei
 * tre: le righe di un elenco sono righe, non schede, e si separano con una
 * linea.
 *
 * ## Il carattere
 *
 * Incluso nel pacchetto, non preso da un CDN. Un carattere scaricato da un
 * terzo e' una richiesta verso quel terzo da ogni finestra che si apre, cioe'
 * esattamente il tracciamento che questo prodotto esiste per non fare. IBM Plex
 * e' sotto licenza SIL Open Font e la licenza viaggia col pacchetto in
 * `fonts/IBMPlex-OFL.txt`.
 *
 * Tre pesi del sans e uno del mono, 247 KB in tutto. Il mono serve agli
 * indirizzi e non e' un vezzo: un alias si trascrive e si confronta a occhio,
 * e in un carattere proporzionale `rn` e `m` si somigliano troppo.
 */

export const TOKENS = `
  --ink: #16151F;
  --ink-soft: #3B3A4B;
  --muted: #5E5C72;
  --paper: #FFFFFF;
  --sunken: #F6F5FA;
  --label: #F0EEF6;
  --label-hover: #E7E4F1;
  --hairline: rgba(22, 21, 31, .10);
  --hairline-strong: rgba(22, 21, 31, .18);

  --brand: #0B7A5E;
  --brand-hover: #096A51;
  --brand-ink: #ffffff;
  --brand-wash: rgba(11, 122, 94, .10);
  --signal: #C6EA33;
  --alarm: #C8372B;

  --shadow:
    0 0 0 1px rgba(22, 21, 31, .07),
    0 2px 4px rgba(22, 21, 31, .05),
    0 18px 44px -14px rgba(22, 21, 31, .3);

  --radius: 14px;
  --radius-sm: 8px;
  --radius-xs: 6px;

  --ease: cubic-bezier(.2, .8, .2, 1);
  --fast: 130ms;
  --slow: 220ms;

  --ui: 'Skudo Plex', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --mono: 'Skudo Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
`

/**
 * Lo stesso sistema al buio, ed e' qui che si gioca la partita.
 *
 * Non e' la tavolozza chiara invertita. Al buio le ombre non funzionano, non
 * c'e' luce da bloccare, quindi l'elevazione la fa un contorno chiaro e un
 * fondo piu' alto di quello sotto. E il verde va acceso: sotto una certa
 * luminosita' il bianco sopra smette di leggersi, e un verde spento su un fondo
 * scuro sparisce.
 */
export const TOKENS_DARK = `
  --ink: #ECEBF4;
  --ink-soft: #C3C1D4;
  --muted: #918EA9;
  --paper: #17161F;
  --sunken: #1C1B26;
  --label: #232231;
  --label-hover: #2D2C3D;
  --hairline: rgba(236, 235, 244, .11);
  --hairline-strong: rgba(236, 235, 244, .2);

  --brand: #14B587;
  --brand-hover: #1BCB99;
  --brand-ink: #06231B;
  --brand-wash: rgba(20, 181, 135, .15);
  --alarm: #F2796C;

  --shadow:
    0 0 0 1px rgba(236, 235, 244, .11),
    0 2px 6px rgba(0, 0, 0, .55),
    0 22px 52px -16px rgba(0, 0, 0, .82);
`

/**
 * Il carattere, dichiarato una volta.
 *
 * Si chiama "Skudo Plex" e non "IBM Plex Sans" apposta: il content script
 * potrebbe un giorno aggiungerlo al documento della pagina ospite, e un nome
 * pubblico verrebbe raccolto da qualunque sito che chiede quel carattere per
 * conto suo, cambiandogli l'aspetto senza che nessuno capisca perche'.
 */
export const FONT_FACE = `
@font-face {
  font-family: 'Skudo Plex';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url('fonts/IBMPlexSans-Regular.woff2') format('woff2');
}

@font-face {
  font-family: 'Skudo Plex';
  font-style: normal;
  font-weight: 500;
  font-display: block;
  src: url('fonts/IBMPlexSans-Medium.woff2') format('woff2');
}

@font-face {
  font-family: 'Skudo Plex';
  font-style: normal;
  font-weight: 600;
  font-display: block;
  src: url('fonts/IBMPlexSans-SemiBold.woff2') format('woff2');
}

@font-face {
  font-family: 'Skudo Plex Mono';
  font-style: normal;
  font-weight: 500;
  font-display: block;
  src: url('fonts/IBMPlexMono-Medium.woff2') format('woff2');
}
`
