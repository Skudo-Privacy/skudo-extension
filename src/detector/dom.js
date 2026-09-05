/**
 * Attraversamento del DOM per il rilevatore.
 *
 * Il punto delicato è lo shadow DOM. Una fetta larga del web moderno costruito
 * con web component tiene i propri `<input>` dentro una shadow root, dove un
 * `document.querySelectorAll` normale non arriva: senza la ricorsione qui sotto
 * l'estensione semplicemente non vede quei campi e all'utente sembra rotta.
 *
 * Limite dichiarato: le shadow root *chiuse* restano invisibili. Non è una
 * mancanza nostra, `element.shadowRoot` è `null` per progetto e non esiste modo
 * di aggirarlo da un content script. Vale per qualsiasi estensione.
 */

/** Profondità massima di annidamento delle shadow root che seguiamo. */
const MAX_SHADOW_DEPTH = 10

/**
 * Come querySelectorAll, ma scende anche dentro le shadow root aperte.
 *
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {Element[]}
 */
export function queryDeep(root, selector, depth = 0) {
  const found = []
  if (!root || typeof root.querySelectorAll !== 'function') return found

  try {
    found.push(...root.querySelectorAll(selector))
  } catch {
    // Selettore rifiutato da un motore più vecchio: meglio nessun risultato
    // che un'eccezione che ferma l'intera scansione della pagina.
    return found
  }

  if (depth >= MAX_SHADOW_DEPTH) return found

  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      found.push(...queryDeep(el.shadowRoot, selector, depth + 1))
    }
  }

  return found
}

/** Risale al nodo radice di un elemento, che sia il documento o una shadow root. */
export function rootOf(el) {
  return typeof el.getRootNode === 'function' ? el.getRootNode() : el.ownerDocument
}

/**
 * Testo delle `<label>` associate a un campo.
 *
 * Tre strade, in ordine di attendibilità:
 *   1. `element.labels`, l'associazione vera secondo lo standard;
 *   2. una `<label>` antenata, che associa senza bisogno di `for`;
 *   3. una `<label for="...">` che punta al `name` invece che all'`id`.
 *
 * La terza è un errore di scrittura, non una funzione: il `for` dovrebbe
 * puntare all'`id`. Ma è un errore frequente, Mozilla l'ha trovato abbastanza
 * spesso nel proprio insieme di addestramento da programmarci attorno, e il
 * campo resta un campo email anche se chi l'ha scritto ha sbagliato.
 *
 * @param {HTMLInputElement} input
 * @returns {string[]}
 */
export function labelTextsFor(input) {
  const texts = []

  const push = (node) => {
    const text = (node?.textContent || '').trim()
    if (text) texts.push(text)
  }

  try {
    for (const label of input.labels || []) push(label)
  } catch {
    // `labels` non è definito su tutti i tipi di input.
  }

  const ancestor = typeof input.closest === 'function' ? input.closest('label') : null
  if (ancestor) push(ancestor)

  const name = input.getAttribute('name')
  if (name) {
    const scope = input.form || rootOf(input)
    if (scope && typeof scope.querySelectorAll === 'function') {
      for (const label of scope.querySelectorAll('label[for]')) {
        if (label.getAttribute('for') === name) push(label)
      }
    }
  }

  return [...new Set(texts)]
}

/**
 * Testo che sta attorno al campo, per i moduli scritti senza `<label>`.
 *
 * Si guarda solo il fratello precedente e il contenitore diretto, e si taglia a
 * 80 caratteri: più in là si finisce a leggere il paragrafo di un articolo e
 * ogni campo di un blog che parla di email diventa un campo email.
 *
 * @param {HTMLInputElement} input
 * @returns {string}
 */
export function nearbyText(input) {
  const parts = []

  let sibling = input.previousElementSibling
  let hops = 0
  while (sibling && hops < 2) {
    if (!['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(sibling.nodeName)) {
      parts.push(sibling.textContent || '')
    }
    sibling = sibling.previousElementSibling
    hops++
  }

  const parent = input.parentElement
  if (parent && parent.querySelectorAll('input, select, textarea').length === 1) {
    parts.push(parent.textContent || '')
  }

  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

/** Attributo in minuscolo, stringa vuota se assente. */
export function attr(el, name) {
  return (el.getAttribute(name) || '').toLowerCase().trim()
}

/**
 * Costruisce una regex che riconosce parole intere dentro gli identificatori
 * usati nel codice, non solo dentro la prosa.
 *
 * Serve perché `\b` di JavaScript considera l'underscore un carattere di parola.
 * `/\bhoneypot\b/` quindi NON riconosce `email_honeypot`, e `/\bcode\b/` non
 * riconosce `promo_code`: esattamente i nomi che si incontrano negli attributi
 * `name` e `id`, dove snake_case e kebab-case sono la norma. Un'esclusione
 * scritta con `\b` sembra funzionare e non scatta quasi mai.
 *
 * @param {string} source  alternative già pronte, es. "code|coupon|promo"
 * @returns {RegExp}
 */
export function wordish(source) {
  return new RegExp(`(?:^|[^a-z0-9])(?:${source})(?:[^a-z0-9]|$)`, 'i')
}
