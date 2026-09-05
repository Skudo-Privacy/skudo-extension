/**
 * Terzo strato: questo modulo serve a iscriversi o ad accedere?
 *
 * ## Perché è la parte che conta
 *
 * Nessuna delle estensioni per alias in circolazione si pone questa domanda:
 * addy.io, SimpleLogin e Firefox Relay mettono il proprio pulsante su ogni
 * campo email che trovano. Su un modulo di accesso il risultato è peggio che
 * inutile. L'utente clicca, gli si genera un indirizzo nuovo, lo inserisce, e
 * non entra: l'alias giusto era quello di sei mesi fa. In più si ritrova un
 * alias buttato nella lista, che poi deve cancellare a mano.
 *
 * Quindi: su un modulo di iscrizione si offre un alias nuovo, su un modulo di
 * accesso si cerca quello che l'utente ha già per quel dominio e si offre di
 * riempirlo. Cambia cosa fa l'estensione, non solo cosa mostra.
 *
 * ## Come
 *
 * Punteggio con segno: positivo verso l'iscrizione, negativo verso l'accesso.
 * L'idea del punteggio pesato con il testo del pulsante di invio come segnale
 * dominante viene da FormAnalyzer di DuckDuckGo (Apache 2.0, vedi NOTICE.md).
 * I pesi qui sono nostri e messi a mano.
 *
 * Nel dubbio si risponde `unknown`, e chi chiama tratta l'ignoto come
 * iscrizione: sbagliare offrendo un alias su un modulo ambiguo è un fastidio,
 * non offrirlo su un'iscrizione vera è non fare il proprio lavoro.
 */

import { attr, queryDeep } from './dom.js'

const LOGIN_WORDS = /\b(log ?in|sign ?in|signin|accedi|entra|login)\b/i
const SIGNUP_WORDS =
  /\b(sign ?up|signup|register|registrati|iscriviti|create (an )?account|crea (un )?account|get started|join|subscribe|iscrizione)\b/i
const FORGOT_WORDS = /\b(forgot|dimenticat[ao]|reset your password|password dimenticata)\b/i
const HAVE_ACCOUNT_WORDS = /\b(already have|hai gi[àa] un|already registered)\b/i
const REMEMBER_WORDS = /\b(remember me|ricordami|stay signed in|keep me logged)\b/i
const TERMS_WORDS = /\b(terms|privacy policy|termini|informativa|condizioni)\b/i

/** Soglia oltre la quale ci sbilanciamo. Sotto, resta `unknown`. */
const DECISION_THRESHOLD = 3

/** Quanti antenati risalire cercando il contenitore del modulo. */
const MAX_ANCESTOR_HOPS = 6

/**
 * Il contenitore da analizzare.
 *
 * `input.form` è la risposta giusta quando esiste, ma una quantità crescente di
 * siti costruiti a componenti non usa `<form>` del tutto. In quel caso si risale
 * fino al primo antenato che assomiglia a un modulo, cioè che contiene un
 * pulsante di invio o almeno due campi.
 *
 * @param {HTMLInputElement} input
 * @returns {Element|null}
 */
export function formScopeFor(input) {
  if (input.form) return input.form

  let node = input.parentElement
  let hops = 0
  while (node && hops < MAX_ANCESTOR_HOPS) {
    const buttons = node.querySelectorAll('button, input[type=submit], [role=button]')
    const fields = node.querySelectorAll('input:not([type=hidden]), select, textarea')
    if (buttons.length > 0 || fields.length > 1) return node
    node = node.parentElement
    hops++
  }
  return null
}

/** Testo dei pulsanti che sembrano l'invio del modulo. */
function submitTexts(scope) {
  const texts = []
  for (const el of queryDeep(
    scope,
    'button, input[type=submit], input[type=button], [role=button]'
  )) {
    const value = el.nodeName === 'INPUT' ? el.getAttribute('value') : el.textContent
    const text = (value || '').replace(/\s+/g, ' ').trim()
    // Un pulsante con dentro un romanzo non è il pulsante di invio.
    if (text && text.length <= 40) texts.push(text)
  }
  return texts
}

/**
 * @param {HTMLInputElement} input
 * @returns {{intent: 'signup'|'login'|'unknown', score: number, signals: string[]}}
 */
export function detectFormIntent(input) {
  const scope = formScopeFor(input)
  if (!scope) return { intent: 'unknown', score: 0, signals: ['no-scope'] }

  let score = 0
  const signals = []

  const add = (amount, name) => {
    score += amount
    signals.push(`${name}: ${amount > 0 ? '+' : ''}${amount}`)
  }

  const passwords = queryDeep(scope, 'input[type=password]')

  // Il segnale più netto in assoluto, quando c'è: lo standard prevede due valori
  // diversi proprio per distinguere i due casi, e chi li scrive sa cosa fa.
  const autocompletes = passwords.map((el) => attr(el, 'autocomplete'))
  if (autocompletes.includes('new-password')) add(6, 'autocomplete:new-password')
  if (autocompletes.includes('current-password')) add(-6, 'autocomplete:current-password')

  // Due caselle password sono password e conferma password: si sta creando.
  if (passwords.length >= 2) add(4, 'two-password-fields')

  // Nessuna password con un campo email da solo: quasi sempre una newsletter o
  // una lista d'attesa. Per noi vale come iscrizione, è il caso in cui un alias
  // serve di più.
  if (passwords.length === 0) add(2, 'no-password-field')

  const texts = submitTexts(scope)
  for (const text of texts) {
    // Il pulsante di invio è la dichiarazione d'intenti del modulo. Pesa più di
    // ogni altra cosa perché è scritto per essere letto proprio così.
    if (SIGNUP_WORDS.test(text)) add(8, `button:${text}`)
    else if (LOGIN_WORDS.test(text)) add(-8, `button:${text}`)
  }

  const scopeText = (scope.textContent || '').replace(/\s+/g, ' ').slice(0, 2000)

  // "Password dimenticata?" e "Ricordami" stanno accanto a un accesso, mai
  // accanto a una registrazione.
  if (FORGOT_WORDS.test(scopeText)) add(-3, 'forgot-password-link')
  if (REMEMBER_WORDS.test(scopeText)) add(-3, 'remember-me')

  // "Hai già un account?" è scritto solo su un modulo di iscrizione, perché è
  // rivolto a chi si è sbagliato di pagina.
  if (HAVE_ACCOUNT_WORDS.test(scopeText)) add(4, 'already-have-account-link')

  // Accettazione dei termini: si accettano una volta sola, all'iscrizione.
  const checkboxes = queryDeep(scope, 'input[type=checkbox]')
  if (checkboxes.length > 0 && TERMS_WORDS.test(scopeText)) add(3, 'terms-acceptance')

  // Come si chiama il modulo, quando si degna di dirlo.
  const identity = [
    attr(scope, 'id'),
    attr(scope, 'class'),
    attr(scope, 'name'),
    attr(scope, 'action'),
  ].join(' ')
  if (SIGNUP_WORDS.test(identity)) add(3, 'scope-name:signup')
  else if (LOGIN_WORDS.test(identity)) add(-3, 'scope-name:login')

  const intent =
    score >= DECISION_THRESHOLD ? 'signup' : score <= -DECISION_THRESHOLD ? 'login' : 'unknown'

  return { intent, score, signals }
}
