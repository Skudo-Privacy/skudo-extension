/**
 * Dove mettere l'icona, e come non finire sotto quella di qualcun altro.
 *
 * ## Il problema delle icone sovrapposte
 *
 * Bitwarden, Proton Pass, 1Password, Dashlane e noi mettiamo tutti la nostra
 * icona nello stesso posto: dentro il bordo destro del campo. Chi ha due di
 * queste estensioni installate si ritrova due icone impilate, e quella sotto
 * non riceve nemmeno i clic — l'altra se li prende tutti. È esattamente il
 * motivo per cui la nostra sembrava non funzionare.
 *
 * Non si può risolvere alzando lo z-index: è una gara che finisce con tutti a
 * 2147483647 e il risultato deciso dall'ordine di iniezione. E vincerla
 * significherebbe coprire noi la loro, cioè rompere il loro prodotto invece del
 * nostro.
 *
 * La soluzione è farsi da parte. Si guarda cosa c'è davvero nel punto dove
 * vorremmo stare, con `document.elementsFromPoint`, e se c'è qualcosa che non è
 * nostro né il campo stesso, ci si sposta a sinistra quanto basta a superarlo.
 * L'idea è la stessa che usa Proton Pass; il codice è nostro e molto più corto,
 * perché a noi basta il caso "un'altra icona nello stesso angolo".
 */

export const ICON_SIZE = 20

/** Spazio fra il bordo del campo e l'icona. */
const INSET = 6

/** Spazio fra la nostra icona e quella di qualcun altro. */
const GAP = 4

/** Oltre questa larghezza non è un'icona: è un bottone, e non lo scavalchiamo. */
const MAX_FOREIGN_WIDTH = 44

/** Non ci si sposta all'infinito: oltre metà campo, tanto vale stare fermi. */
const MAX_SHIFT_RATIO = 0.5

/**
 * Di quanto spostarsi a sinistra per non stare sopra a nessuno.
 *
 * @param {HTMLElement} host  il nostro elemento, da ignorare nel conteggio
 * @param {DOMRect} rect      il rettangolo del campo
 * @returns {number} pixel di spostamento
 */
export function foreignShift(host, rect) {
  // `elementsFromPoint` salta gli elementi con `pointer-events: none`, e il
  // nostro non lo è: senza questo si troverebbe solo se stesso.
  const previous = host.style.pointerEvents
  host.style.pointerEvents = 'none'

  let shift = 0
  const limit = rect.width * MAX_SHIFT_RATIO
  const y = rect.top + rect.height / 2

  try {
    // Fino a tre icone altrui accanto alla stessa casella: oltre, la casella è
    // di qualcun altro e noi ci togliamo di mezzo.
    for (let step = 0; step < 3; step++) {
      const x = rect.right - INSET - ICON_SIZE / 2 - shift
      if (x < rect.left) break

      const found = topmostForeign(document.elementsFromPoint(x, y), host)
      if (!found) break

      const foreign = found.getBoundingClientRect()
      if (foreign.width === 0 || foreign.width > MAX_FOREIGN_WIDTH) break

      const next = shift + foreign.width + GAP
      if (next > limit) break
      shift = next
    }
  } catch {
    // `elementsFromPoint` con coordinate strane non deve impedire di
    // disegnare l'icona: meglio sovrapposta che assente.
  } finally {
    host.style.pointerEvents = previous
  }

  return shift
}

/**
 * Il primo elemento della pila che non è nostro, non è il campo, e non è la
 * pagina stessa.
 */
function topmostForeign(stack, host) {
  for (const el of stack) {
    if (el === host || host.contains(el)) continue
    if (el === document.documentElement || el === document.body) return null

    // Arrivati al campo o al suo contenitore, sopra non c'era nessuno.
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'FORM' || tag === 'LABEL') return null

    return el
  }
  return null
}

/**
 * Posizione assoluta dell'icona rispetto al documento.
 *
 * @returns {{left: number, top: number}}
 */
export function iconPosition(rect, shift) {
  return {
    left: rect.right + window.scrollX - ICON_SIZE - INSET - shift,
    top: rect.top + window.scrollY + (rect.height - ICON_SIZE) / 2,
  }
}

/** Posizione del pannello: sotto il campo, allineato a sinistra con esso. */
export function panelPosition(rect) {
  return {
    left: rect.left + window.scrollX,
    top: rect.bottom + window.scrollY + 6,
  }
}
