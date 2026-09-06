/**
 * I valori del sistema visivo, in un posto solo.
 *
 * Il popup e il menu iniettato nelle pagine sono due contesti diversi, con due
 * fogli di stile diversi, e finora avevano due copie degli stessi colori.
 * Bastava cambiarne una per avere un prodotto che sembra due prodotti: una
 * differenza di quattro punti di grigio non si nota guardando, si nota
 * usandolo.
 *
 * ## Perche' la tavolozza e' stata rifatta
 *
 * La prima era una tinta desaturata su bianco puro, con i neutri quasi grigi.
 * E' esattamente il modello base di qualunque interfaccia, ed e' il motivo per
 * cui sembrava fatta da una macchina: non aveva sbagliato niente e non aveva
 * scelto niente.
 *
 * Quella che c'e' adesso fa tre scelte, e si vedono tutte e tre:
 *
 *   1. **I neutri hanno un fondo violaceo, non grigio.** Un nero puro o un
 *      grigio puro non esistono in natura e su uno schermo sembrano un vuoto.
 *      Un nero con dentro un po' di viola ha profondita': e' il motivo per cui
 *      le interfacce che si guardano volentieri non usano mai `#000` o `#111`.
 *
 *   2. **Il verde e' saturo.** Il marchio nasce spento (`#0F5E56`), che va
 *      benissimo su carta e su una pagina grande, e su una finestra da
 *      seicento pixel diventa un grigio-verde. Qui il marchio resta per le
 *      superfici, e l'interazione usa una versione viva che si stacca dal
 *      fondo.
 *
 *   3. **Il contrasto e' alto.** I testi secondari erano al limite del
 *      leggibile per sembrare eleganti. Non sembravano eleganti, sembravano
 *      slavati.
 *
 * ## Il carattere
 *
 * Inter, incluso nel pacchetto, non preso da un CDN. Un carattere scaricato da
 * un terzo e' una richiesta verso quel terzo da ogni finestra che si apre,
 * cioe' esattamente il tracciamento che questo prodotto esiste per non fare.
 * E' sotto licenza SIL Open Font, e la licenza viaggia con il pacchetto in
 * `fonts/Inter-OFL.txt`.
 *
 * Vale per le pagine dell'estensione. Il menu che compare dentro i siti resta
 * sulla pila di sistema: per usarlo li' il file dovrebbe diventare una risorsa
 * raggiungibile dalle pagine, e in duecentocinquanta pixel di righe dense la
 * differenza non vale quella superficie in piu'.
 */

export const TOKENS = `
  --ink: #16151F;
  --ink-soft: #3B3A4B;
  --muted: #5E5C72;
  --paper: #FFFFFF;
  --label: #F4F3F9;
  --label-hover: #EAE8F3;
  --hairline: rgba(22, 21, 31, .10);
  --hairline-strong: rgba(22, 21, 31, .17);

  --brand: #0B7A5E;
  --brand-hover: #096A51;
  --brand-ink: #ffffff;
  --brand-wash: rgba(11, 122, 94, .10);
  --signal: #C6EA33;
  --alarm: #C8372B;

  --shadow:
    0 0 0 1px rgba(22, 21, 31, .06),
    0 1px 2px rgba(22, 21, 31, .06),
    0 16px 40px -12px rgba(22, 21, 31, .28);

  --radius: 16px;
  --radius-sm: 10px;
  --radius-xs: 8px;

  --ease: cubic-bezier(.2, .8, .2, 1);
  --fast: 130ms;
  --slow: 220ms;

  --ui: 'Skudo Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
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
  --muted: #928FA8;
  --paper: #17161F;
  --label: #201F2B;
  --label-hover: #2A2939;
  --hairline: rgba(236, 235, 244, .10);
  --hairline-strong: rgba(236, 235, 244, .19);

  --brand: #14B587;
  --brand-hover: #1BCB99;
  --brand-ink: #06231B;
  --brand-wash: rgba(20, 181, 135, .14);
  --alarm: #F2796C;

  --shadow:
    0 0 0 1px rgba(236, 235, 244, .10),
    0 2px 6px rgba(0, 0, 0, .55),
    0 20px 48px -14px rgba(0, 0, 0, .8);
`

/**
 * Il carattere, dichiarato una volta.
 *
 * Si chiama "Skudo Inter" e non "Inter" apposta: il content script potrebbe un
 * giorno aggiungerlo al documento della pagina ospite, e un nome generico
 * verrebbe raccolto da qualunque sito che chiede "Inter" per conto suo,
 * cambiandogli l'aspetto senza che nessuno capisca perche'.
 */
export const FONT_FACE = `
@font-face {
  font-family: 'Skudo Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: block;
  src: url('fonts/InterVariable.woff2') format('woff2');
}
`
