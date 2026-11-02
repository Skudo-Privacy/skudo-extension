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
  --ink: #14151A;
  --ink-soft: #383B45;
  --muted: #5B5F6B;
  --paper: #FFFFFF;
  --page: #FFFFFF;
  --card: #FFFFFF;
  --sunken: #F5F6F9;
  --label: #EDF0F6;
  --label-hover: #E1E6F0;
  --hairline: rgba(20, 21, 26, .10);
  --hairline-strong: rgba(20, 21, 26, .18);

  --brand: #2147D1;
  --brand-hover: #1A3AB0;
  --brand-ink: #ffffff;
  --brand-wash: rgba(33, 71, 209, .10);
  --signal: #F5C400;
  --alarm: #C8372B;

  --shadow:
    0 0 0 1px rgba(20, 21, 26, .07),
    0 2px 4px rgba(20, 21, 26, .05),
    0 18px 44px -14px rgba(20, 21, 26, .3);

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
 * fondo piu' alto di quello sotto. E l'accento va acceso: sotto una certa
 * luminosita' il bianco sopra smette di leggersi, e un accento spento su un fondo
 * scuro sparisce.
 */
export const TOKENS_DARK = `
  --ink: #E9EAF0;
  --ink-soft: #C2C5D2;
  --muted: #8D91A3;
  --paper: #14151A;
  --page: #101115;
  --card: #1D1E26;
  --sunken: #191A21;
  --label: #212432;
  --label-hover: #2B2F42;
  --hairline: rgba(233, 234, 240, .11);
  --hairline-strong: rgba(233, 234, 240, .2);

  --brand: #7C97FF;
  --brand-hover: #96ABFF;
  --brand-ink: #0A1236;
  --brand-wash: rgba(124, 151, 255, .16);
  --alarm: #F2796C;

  --shadow:
    0 0 0 1px rgba(233, 234, 240, .11),
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
