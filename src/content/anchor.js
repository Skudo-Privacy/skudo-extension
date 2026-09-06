/**
 * Dove mettere l'icona e il menu, e come non finire sotto quella di qualcun
 * altro.
 *
 * ## Il problema delle icone sovrapposte
 *
 * Bitwarden, Proton Pass, 1Password, Dashlane e noi mettiamo tutti la nostra
 * icona nello stesso posto: dentro il bordo destro del campo. Chi ha due di
 * queste estensioni installate si ritrova due icone impilate, e quella sotto
 * non riceve nemmeno i clic: l'altra se li prende tutti. E' esattamente il
 * motivo per cui la nostra sembrava non funzionare.
 *
 * Non si puo' risolvere alzando lo z-index: e' una gara che finisce con tutti a
 * 2147483647 e il risultato deciso dall'ordine di iniezione. E vincerla
 * significherebbe coprire noi la loro, cioe' rompere il loro prodotto invece del
 * nostro.
 *
 * La soluzione e' farsi da parte. Si guarda cosa c'e' davvero nel punto dove
 * vorremmo stare, con `document.elementsFromPoint`, e se c'e' qualcosa che non e'
 * nostro ne' il campo stesso, ci si sposta a sinistra quanto basta a superarlo.
 */

/**
 * L'icona si adatta al campo.
 *
 * Una misura fissa non funziona: su un campo alto cinquanta pixel un'icona da
 * venti sembra caduta li' per sbaglio, su un campo da ventiquattro esce dai
 * bordi. Si scala con il campo, dentro due limiti, lasciando un margine sopra
 * e sotto. Sono gli stessi limiti che usa Proton Pass, ed e' il motivo per cui
 * la loro icona sta bene su qualunque modulo.
 */
export const ICON_MIN = 16
export const ICON_MAX = 28
const ICON_MARGIN = 8

export function iconSize(rect) {
  const room = rect.height - ICON_MARGIN * 2
  return Math.round(Math.max(ICON_MIN, Math.min(ICON_MAX, room)))
}

/** Spazio fra il bordo del campo e l'icona. */
const INSET = 6

/** Spazio fra la nostra icona e quella di qualcun altro. */
const GAP = 4

/** Oltre questa larghezza non e' un'icona: e' un bottone, e non lo scavalchiamo. */
const MAX_FOREIGN_WIDTH = 44

/** Non ci si sposta all'infinito: oltre metà campo, tanto vale stare fermi. */
const MAX_SHIFT_RATIO = 0.5

/** Padding destro che un campo ha per conto suo. Oltre, l'ha chiesto qualcuno. */
const NATURAL_PADDING = 12

/**
 * Larghezza del menu.
 *
 * Duecentocinquanta, che e' la misura del dropdown di Proton Pass, e non e' un
 * numero preso a caso: un menu attaccato a un campo non e' una finestra di
 * dialogo. Piu' largo del campo sembra scollato, e sopra i trecento pixel
 * smette di leggersi come "questo appartiene a quel campo" e comincia a
 * leggersi come "un sito mi sta chiedendo qualcosa".
 *
 * Il nostro era trecentosessanta, e sembrava una scheda capitata li'.
 */
export const MENU_WIDTH = 250

/** Quanto respiro lasciare fra il menu e il bordo della finestra. */
const VIEWPORT_MARGIN = 8

/**
 * Spazio che qualcun altro si e' gia' riservato dentro il campo.
 *
 * `elementsFromPoint` trova solo chi mette un *elemento* li'. Due modi diffusi
 * di occupare quell'angolo non lasciano nessun elemento da trovare:
 *
 *   - un'immagine di sfondo sul campo stesso, che e' come Bitwarden ha disegnato
 *     a lungo la propria icona;
 *   - un `padding-right` gonfiato dal sito o da un'estensione per fare posto a
 *     un bottone che sta fuori dal campo.
 *
 * In entrambi i casi il punto che campioniamo restituisce l'INPUT, quindi
 * "nessuno", e ci piazzavamo sopra. Questo e' il motivo per cui l'icona
 * continuava a sovrapporsi anche dopo lo spostamento: non stavamo cercando la
 * cosa giusta.
 */
function reservedShift(input) {
  if (!input || input.nodeType !== 1) return 0

  const style = getComputedStyle(input)
  let reserved = 0

  const padding = parseFloat(style.paddingRight)
  if (Number.isFinite(padding) && padding > NATURAL_PADDING) {
    reserved = padding - NATURAL_PADDING
  }

  // Uno sfondo ancorato a destra e' un'icona disegnata, non una decorazione
  // che si possa ignorare.
  if (style.backgroundImage && style.backgroundImage !== 'none') {
    const position = style.backgroundPosition || ''
    if (/right|100%/.test(position)) reserved = Math.max(reserved, ICON_MAX + GAP)
  }

  return reserved
}

/**
 * Di quanto spostarsi a sinistra per non stare sopra a nessuno.
 *
 * @param {HTMLElement} host        il nostro elemento, da ignorare nel conteggio
 * @param {DOMRect} rect            il rettangolo del campo
 * @param {HTMLInputElement} input  il campo, per lo spazio gia' riservato
 * @returns {number} pixel di spostamento
 */
export function foreignShift(host, rect, input) {
  // `elementsFromPoint` salta gli elementi con `pointer-events: none`, e il
  // nostro non lo e': senza questo si troverebbe solo se stesso.
  const previous = host.style.pointerEvents
  host.style.pointerEvents = 'none'

  const limit = rect.width * MAX_SHIFT_RATIO
  const y = rect.top + rect.height / 2
  const size = iconSize(rect)

  // Si parte da quello che e' gia' stato riservato, poi si scavalca chi si vede.
  let shift = Math.min(reservedShift(input), limit)

  try {
    // Fino a tre icone altrui accanto alla stessa casella: oltre, la casella e'
    // di qualcun altro e noi ci togliamo di mezzo.
    for (let step = 0; step < 3; step++) {
      const x = rect.right - INSET - size / 2 - shift
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
 * Il primo elemento della pila che non e' nostro, non e' il campo, e non e' la
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
  const size = iconSize(rect)
  return {
    left: rect.right + window.scrollX - size - INSET - shift,
    top: rect.top + window.scrollY + (rect.height - size) / 2,
  }
}

/**
 * Posizione del menu: sotto il campo, allineato a sinistra con esso.
 *
 * Con un margine, pero'. Un campo vicino al bordo destro della finestra, che
 * su un modulo stretto o su una finestra affiancata capita spesso, mandava il
 * menu meta' fuori dallo schermo: le righe finivano dove non si possono
 * premere, e non c'era modo di accorgersene se non provandolo li'.
 */
export function menuPosition(rect) {
  const room = document.documentElement.clientWidth
  const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, room - MENU_WIDTH - VIEWPORT_MARGIN))

  return {
    left: left + window.scrollX,
    top: rect.bottom + window.scrollY + 5,
  }
}
