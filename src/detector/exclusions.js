/**
 * Primo strato: cosa NON è un campo email.
 *
 * Si scarta prima di dare punteggi, perché un falso positivo qui costa molto
 * più di un falso negativo. Se non troviamo un campo, l'utente apre il popup e
 * copia l'alias a mano: una seccatura. Se invece infiliamo un alias nella
 * casella di ricerca, nel campo "oggetto" di un modulo di contatto o nel codice
 * sconto di un carrello, abbiamo rotto la pagina di qualcun altro.
 *
 * Le esclusioni ricalcano quelle che DuckDuckGo tiene nella propria
 * configurazione di autofill (`matching-config`, Apache 2.0): sono il residuo di
 * un numero di moduli reali che noi non abbiamo ancora visto. Vedi NOTICE.md.
 */

import { attr, wordish } from './dom.js'

/** Tipi di input che non possono contenere un indirizzo, qualunque cosa dica il nome. */
const IMPOSSIBLE_TYPES = new Set([
  'password',
  'checkbox',
  'radio',
  'submit',
  'button',
  'reset',
  'file',
  'hidden',
  'image',
  'range',
  'color',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
  'number',
  'tel',
  'url',
  'search',
])

/**
 * Parole che, trovate negli attributi testuali, dicono che il campo serve ad
 * altro anche se contiene "mail".
 *
 * - ricerca e filtro: "Search by email", "Filter emails". Il caso più comune.
 * - oggetto e corpo: moduli di contatto e webmail.
 * - codici: buoni sconto, codici di verifica, codici invito.
 * - conferma: gestita a parte, vedi sotto.
 */
const PURPOSE_ELSEWHERE = wordish('search|filter|query|subject|oggetto|cerca|filtra|ricerca')

const CODE_LIKE = wordish('code|coupon|promo|voucher|discount|codice|sconto|otp|token|pin')

/** Campi trappola per i robot: si riconoscono dal nome, oltre che dalle dimensioni. */
const HONEYPOT_LIKE = wordish('fake|honeypot|honey|bot|leave.?blank|do.?not.?fill')

/** Attributi in cui cerchiamo i motivi di esclusione. */
const TEXT_ATTRS = ['name', 'id', 'placeholder', 'aria-label', 'title', 'class', 'data-testid']

/**
 * Un campo di conferma ("Conferma email", "Ripeti indirizzo") è un campo email
 * a tutti gli effetti, ma non è quello dove va proposto un alias nuovo: va
 * riempito con lo stesso valore del primo. Non si esclude, si segnala.
 */
const CONFIRMATION = wordish('confirm|confirmation|repeat|re-?enter|verify|conferma|ripeti')

/**
 * Il nome del campo dichiarato in `autocomplete`, ripulito dai prefissi.
 *
 * Lo standard non prevede un valore solo: `autocomplete` è una sequenza, e
 * `"shipping email"`, `"billing email"` e `"section-work email"` sono tutti
 * modi corretti di dire "email". Un controllo di uguaglianza sull'attributo
 * intero scarta campi email perfettamente dichiarati, ed è un errore silenzioso
 * proprio dove l'utente si aspetta che funzioni: le casse dei negozi, che sono
 * il posto dove usare l'indirizzo vero fa più danno.
 *
 * Il token finale può essere `webauthn`, che si aggiunge in coda e non
 * sostituisce il nome del campo.
 *
 * @param {HTMLInputElement} el
 * @returns {string}
 */
function autocompleteField(el) {
  const tokens = attr(el, 'autocomplete').split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return ''
  if (tokens[tokens.length - 1] === 'webauthn') tokens.pop()
  return tokens[tokens.length - 1] || ''
}

/**
 * @param {HTMLInputElement} el
 * @returns {string|null} il motivo dell'esclusione, o null se il campo passa
 */
export function exclusionReason(el) {
  if (!el || el.nodeName !== 'INPUT') return 'not-an-input'

  const type = attr(el, 'type')
  if (IMPOSSIBLE_TYPES.has(type)) return `type:${type}`

  if (el.disabled) return 'disabled'
  if (el.readOnly) return 'readonly'

  // `autocomplete="off"` non esclude niente: mezzo web lo mette per abitudine
  // anche sui campi email veri. Un valore *specifico e diverso* invece è una
  // dichiarazione esplicita del sito, e a quella si crede.
  const autocomplete = autocompleteField(el)
  if (autocomplete && !['on', 'off', 'email', 'username'].includes(autocomplete)) {
    return `autocomplete:${autocomplete}`
  }

  if (attr(el, 'role') === 'search' || attr(el, 'role') === 'searchbox') return 'role:search'

  for (const name of TEXT_ATTRS) {
    const value = attr(el, name)
    if (!value) continue
    if (PURPOSE_ELSEWHERE.test(value)) return `${name}:search-or-subject`
    if (CODE_LIKE.test(value)) return `${name}:code`
    if (HONEYPOT_LIKE.test(value)) return `${name}:honeypot`
  }

  // Una form di ricerca contiene campi che parlano di email senza esserlo
  // ("cerca fra i tuoi messaggi"). Il ruolo del contenitore vale per tutti.
  const form = el.form
  if (
    form &&
    (attr(form, 'role') === 'search' ||
      wordish('search|cerca').test(attr(form, 'id') + ' ' + attr(form, 'class')))
  ) {
    return 'form:search'
  }

  return null
}

/**
 * Il campo è la seconda casella di una coppia "email / conferma email"?
 * @param {HTMLInputElement} el
 */
export function isConfirmationField(el) {
  return TEXT_ATTRS.some((name) => CONFIRMATION.test(attr(el, name)))
}
