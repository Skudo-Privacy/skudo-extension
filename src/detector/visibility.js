/**
 * Quarto strato: il campo esiste davvero sullo schermo?
 *
 * Serve contro due cose diverse.
 *
 * I campi trappola per i robot, che i siti mettono apposta: sono campi email
 * veri per ogni attributo, nascosti agli umani, e chi li riempie viene
 * classificato come robot. Un'estensione che ci infila un alias fa bocciare
 * l'iscrizione dell'utente senza dirgli perché.
 *
 * E i moduli in un pannello chiuso o in una scheda non attiva, che esistono nel
 * DOM ma non sono davanti a nessuno. Attaccarci un'icona significa vederla
 * comparire in mezzo alla pagina, ancorata a niente.
 *
 * SimpleLogin controlla `pointerEvents === 'auto'`, che è troppo stretto: il
 * valore calcolato può essere `all` o `visiblePainted` su elementi dentro un
 * SVG o con regole ereditate, e campi buoni verrebbero scartati. Qui si
 * verifica solo che non sia `none`.
 */

import { MIN_HEIGHT, MIN_WIDTH } from './env.js'

/**
 * @param {HTMLInputElement} el
 * @param {{getRect: Function, getStyle: Function}} env
 * @returns {string|null} il motivo dello scarto, o null se il campo è usabile
 */
export function usabilityProblem(el, env) {
  const style = env.getStyle(el)
  if (!style) return 'no-style'

  if (style.visibility === 'hidden' || style.visibility === 'collapse') return 'visibility'
  if (style.display === 'none') return 'display'
  if (style.pointerEvents === 'none') return 'pointer-events'

  const opacity = parseFloat(style.opacity)
  if (!Number.isNaN(opacity) && opacity < 0.1) return 'opacity'

  const rect = env.getRect(el)
  if (!rect) return 'no-rect'
  if (rect.width < MIN_WIDTH) return `width:${Math.round(rect.width)}`
  if (rect.height < MIN_HEIGHT) return `height:${Math.round(rect.height)}`

  // Trappola classica: dimensioni normali, ma spinta fuori dallo schermo con
  // `position:absolute; left:-9999px`. Non è nascosta secondo nessuna proprietà
  // di stile, quindi i controlli sopra la lasciano passare, ed è la forma di
  // honeypot più diffusa perché non insospettisce i lettori di schermo. Si
  // riconosce solo dalla geometria.
  if (rect.right <= 0 || rect.bottom <= 0) return 'offscreen'

  return null
}
