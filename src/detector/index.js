/**
 * Rilevatore di campi email.
 *
 * Cinque strati, in quest'ordine:
 *
 *   0. esclusione      cosa non è un campo email                exclusions.js
 *   1. certezza        quando è il sito stesso a dircelo        qui sotto
 *   2. punteggio       segnali pesati, per tutto il resto       signals.js
 *   3. intento         iscrizione o accesso                     form-intent.js
 *   4. sanità fisica   esiste sullo schermo                     visibility.js
 *
 * L'ordine non è casuale. Si scarta prima di misurare, perché un falso positivo
 * costa più di un falso negativo. E lo strato 1 esiste separato dallo strato 2
 * perché quando un sito scrive `type="email"` o `autocomplete="email"` sta
 * rispondendo alla nostra domanda per iscritto: dargli un punteggio e poi una
 * soglia significa lasciare aperta la possibilità di contraddirlo, che non ha
 * senso.
 */

import { attr, queryDeep } from './dom.js'
import { createEnv } from './env.js'
import { exclusionReason, isConfirmationField } from './exclusions.js'
import { detectFormIntent } from './form-intent.js'
import { BIAS, SIGNALS, buildContext } from './signals.js'
import { usabilityProblem } from './visibility.js'

/** Soglia del modello di Mozilla sulla probabilità in uscita. */
const SCORE_THRESHOLD = 0.5

/**
 * @typedef {object} EmailField
 * @property {HTMLInputElement} element
 * @property {'certain'|'likely'} confidence
 * @property {number} score              probabilità 0..1 (1 per i campi certi)
 * @property {string[]} signals          quali segnali si sono accesi
 * @property {'signup'|'login'|'unknown'} formIntent
 * @property {boolean} isConfirmation    seconda casella di "email / conferma email"
 * @property {'create'|'reuse'|'repeat'} action  cosa proporre all'utente
 */

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x))
}

/**
 * Il sito ce l'ha già detto: sono attributi standard, con un significato solo.
 * @param {HTMLInputElement} input
 */
function isCertain(input) {
  if (attr(input, 'type') === 'email') return true
  // Stessa attenzione di exclusions.js: `autocomplete` è una sequenza di token,
  // e "shipping email" vale quanto "email".
  return attr(input, 'autocomplete').split(/\s+/).includes('email')
}

/**
 * Cosa ha senso proporre su questo campo.
 *
 * Su un modulo di accesso non si crea niente di nuovo: si cerca l'alias che
 * l'utente ha già per quel dominio. È il motivo per cui lo strato 3 esiste.
 * L'ignoto viene trattato come iscrizione, perché non offrire un alias su
 * un'iscrizione vera è il fallimento peggiore dei due.
 */
function actionFor(formIntent, isConfirmation) {
  if (isConfirmation) return 'repeat'
  return formIntent === 'login' ? 'reuse' : 'create'
}

/**
 * Valuta un singolo campo.
 *
 * @param {HTMLInputElement} input
 * @param {object} [options]
 * @returns {EmailField|null}
 */
export function evaluateField(input, { env = createEnv(), explain = false } = {}) {
  const excluded = exclusionReason(input)
  if (excluded) return explain ? { element: input, rejected: excluded } : null

  const unusable = usabilityProblem(input, env)
  if (unusable) return explain ? { element: input, rejected: unusable } : null

  const { intent: formIntent } = detectFormIntent(input)
  const isConfirmation = isConfirmationField(input)
  const action = actionFor(formIntent, isConfirmation)

  if (isCertain(input)) {
    return {
      element: input,
      confidence: 'certain',
      score: 1,
      signals: ['declared-by-site'],
      formIntent,
      isConfirmation,
      action,
    }
  }

  const context = buildContext(input, formIntent)
  const fired = SIGNALS.filter((signal) => {
    try {
      return signal.test(input, context)
    } catch {
      // Un segnale che esplode su un DOM strano non deve fermare gli altri.
      return false
    }
  })

  const sum = fired.reduce((total, signal) => total + signal.weight, BIAS)
  const score = sigmoid(sum)

  if (score <= SCORE_THRESHOLD) {
    return explain
      ? { element: input, rejected: `score:${score.toFixed(3)}`, signals: fired.map((s) => s.name) }
      : null
  }

  return {
    element: input,
    confidence: 'likely',
    score,
    signals: fired.map((signal) => signal.name),
    formIntent,
    isConfirmation,
    action,
  }
}

/**
 * Trova tutti i campi email sotto una radice, shadow root aperte comprese.
 *
 * @param {ParentNode} root
 * @param {object} [options]
 * @returns {EmailField[]}
 */
export function findEmailFields(root = globalThis.document, options = {}) {
  const results = []
  for (const input of queryDeep(root, 'input')) {
    const field = evaluateField(input, options)
    if (field && !field.rejected) results.push(field)
  }
  return results
}

/**
 * Come findEmailFields, ma restituisce anche gli scarti con il motivo. Serve
 * agli strumenti di verifica sul corpus, non al funzionamento normale.
 */
export function explainRoot(root = globalThis.document, options = {}) {
  return queryDeep(root, 'input').map((input) => evaluateField(input, { ...options, explain: true }))
}

export { detectFormIntent, exclusionReason }
