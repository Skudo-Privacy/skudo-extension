/**
 * Adattatore fra il rilevatore e il mondo esterno (geometria e stile calcolati).
 *
 * Esiste per due motivi.
 *
 * Il primo è la verificabilità: `getBoundingClientRect()` in un DOM simulato
 * restituisce sempre zeri, quindi un controllo di dimensione minima scritto
 * contro il DOM vero non si può provare in nessun test. Passando da qui, i test
 * iniettano la geometria che vogliono e il resto del rilevatore resta puro.
 *
 * Il secondo è la resistenza al fingerprinting. Su Mullvad Browser e LibreWolf
 * `privacy.resistFingerprinting` è attivo di serie: la finestra è messa a
 * riquadro (letterboxing) su misure arrotondate, e la precisione dei timer
 * scende a 100ms. Nessuna delle due cose rompe il rilevamento, ma vanno tenute
 * presenti qui e non sparse nel codice: niente confronti di posizione al pixel,
 * niente logica che dipenda da un timer fine.
 */

/** Dimensioni sotto le quali un campo non è un campo vero ma una trappola o un residuo. */
export const MIN_WIDTH = 50
export const MIN_HEIGHT = 18

export function createEnv(view = globalThis.window) {
  return {
    getRect(el) {
      return el.getBoundingClientRect()
    },
    getStyle(el) {
      return view.getComputedStyle(el)
    },
  }
}

/**
 * Ambiente per i test: la geometria arriva da una mappa, lo stile calcolato
 * resta quello vero.
 *
 * Il motivo della differenza: in un DOM simulato `getBoundingClientRect()`
 * restituisce zeri per tutto e va per forza sostituito, mentre
 * `getComputedStyle()` funziona e legge davvero gli stili inline. Sostituire
 * anche quello renderebbe i test dei campi nascosti una finzione che non prova
 * niente.
 */
export function createFakeEnv({
  rects = new Map(),
  styles = new Map(),
  view = globalThis.window,
} = {}) {
  const defaultRect = { width: 220, height: 32, top: 100, left: 20, bottom: 132, right: 240 }

  return {
    getRect: (el) => ({ ...defaultRect, ...(rects.get(el) || {}) }),
    getStyle: (el) => {
      if (styles.has(el)) return styles.get(el)
      return view.getComputedStyle(el)
    },
  }
}
