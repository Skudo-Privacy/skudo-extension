/**
 * I valori del sistema visivo, in un posto solo.
 *
 * Il popup e il pannello iniettato nelle pagine sono due contesti diversi, con
 * due fogli di stile diversi, e finora avevano due copie degli stessi colori.
 * Bastava cambiarne una per avere un prodotto che sembra due prodotti: una
 * differenza di quattro punti di grigio non si nota guardando, si nota
 * usandolo.
 *
 * ## Perche' i neutri sono verdi
 *
 * Non c'e' un grigio puro in questa tavolozza. Ogni neutro ha una punta di
 * verde presa dal marchio, dal quasi nero al fondo delle etichette. E' la
 * differenza fra un'interfaccia che ha un colore e una che ha un colore
 * appiccicato sopra i bottoni: il verde si sente anche dove non si vede.
 *
 * ## Perche' il lime compare quasi mai
 *
 * `--signal` e' il colore piu' forte che abbiamo, e un colore forte usato
 * ovunque smette di significare qualcosa. Qui significa una cosa sola: e'
 * fatto. Compare quando un alias e' stato creato o copiato, per un momento, e
 * nient'altro lo usa.
 *
 * ## Nessun carattere scaricato
 *
 * Il content script gira su ogni pagina che l'utente apre. Un carattere preso
 * da un CDN sarebbe una richiesta verso terzi da ogni pagina, cioe' esattamente
 * il tracciamento che questo prodotto esiste per non fare. Si usa la pila di
 * sistema, e la si usa bene.
 */

export const TOKENS = `
  --ink: #0B1F1C;
  --ink-soft: #3E4C49;
  --muted: #63706D;
  --paper: #ffffff;
  --label: #EEF2F0;
  --label-hover: #E4EAE7;
  --hairline: rgba(11, 31, 28, .09);
  --hairline-strong: rgba(11, 31, 28, .16);

  --brand: #0F5E56;
  --brand-hover: #0B4741;
  --brand-ink: #ffffff;
  --signal: #C6EA33;
  --alarm: #C0392B;

  --shadow:
    0 0 0 1px rgba(11, 31, 28, .05),
    0 1px 2px rgba(11, 31, 28, .05),
    0 14px 38px -10px rgba(11, 31, 28, .26);

  --radius: 16px;
  --radius-sm: 11px;
  --radius-xs: 8px;

  --ease: cubic-bezier(.2, .8, .2, 1);
  --fast: 130ms;
  --slow: 220ms;

  --ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
`

/**
 * Lo stesso sistema al buio.
 *
 * Non e' la tavolozza chiara invertita: le ombre al buio non funzionano (non
 * c'e' luce da bloccare), quindi l'elevazione la fa un contorno chiaro, e il
 * verde del marchio va schiarito perche' sotto una certa luminosita' il testo
 * bianco sopra smette di leggersi.
 */
export const TOKENS_DARK = `
  --ink: #EDF2F0;
  --ink-soft: #C2CCC9;
  --muted: #8A9895;
  --paper: #101614;
  --label: #1A2220;
  --label-hover: #212B28;
  --hairline: rgba(237, 242, 240, .10);
  --hairline-strong: rgba(237, 242, 240, .18);

  --brand: #17786C;
  --brand-hover: #1E8E80;
  --brand-ink: #ffffff;
  --alarm: #F0837A;

  --shadow:
    0 0 0 1px rgba(237, 242, 240, .09),
    0 2px 4px rgba(0, 0, 0, .5),
    0 18px 44px -12px rgba(0, 0, 0, .75);
`
