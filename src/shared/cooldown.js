/**
 * Il ritmo con cui si possono creare alias, e come si racconta.
 *
 * ## Perche' esiste
 *
 * Creare un alias e' un clic dentro un campo. Un clic e' una cosa che si da'
 * facilmente due volte: la pagina ridisegna il modulo mentre si preme, il
 * pannello non si e' visto, il dito ha rimbalzato. Senza freno bastano tre
 * secondi distratti per ritrovarsi cinque indirizzi, e da quel momento non c'e'
 * piu' modo di sapere quale dei cinque e' stato davvero dato al sito.
 *
 * Sette secondi fra uno e l'altro non si notano quando se ne crea uno solo,
 * che e' il caso normale. Si notano eccome quando ne stanno partendo cinque di
 * fila, che e' il momento in cui devono notarsi.
 *
 * ## Perche' e' un modulo a parte, e senza dipendenze
 *
 * Lo stesso conteggio serve in tre posti: il contesto di sfondo, che decide; il
 * popup, che disegna il bottone; il pannello dentro le pagine, che disegna la
 * riga. Tre copie della stessa aritmetica sono tre occasioni di scriverla
 * diversa, e la differenza si vedrebbe come un bottone che dice "fra 3 secondi"
 * e poi rifiuta.
 *
 * Qui dentro non ci sono orologi ne' temporizzatori: si passa `now`. Una
 * funzione che legge `Date.now()` da sola non si puo' provare senza aspettare
 * per davvero.
 *
 * ## Perche' il tempo e' assoluto e non un conto alla rovescia
 *
 * Un `setInterval` che sottrae un secondo alla volta si scolla dalla realta'
 * appena il computer va in sospensione o la scheda passa in secondo piano, e i
 * browser rallentano apposta i temporizzatori delle schede nascoste. Qui si
 * conserva *quando* e' successa l'ultima creazione, e ogni ridisegno ricalcola
 * la differenza: chiudere il popup e riaprirlo dopo dieci secondi mostra il
 * bottone pronto, non un conto alla rovescia ripartito da capo.
 */

/** Fra un alias e il successivo. */
export const GAP_MS = 7000

/** Quanti se ne creano di fila prima della pausa lunga. */
export const BURST = 3

/** La pausa dopo il terzo. */
export const BURST_GAP_MS = 15000

/**
 * Dopo quanto silenzio la serie riparte da capo.
 *
 * Tre alias creati in un pomeriggio non sono una raffica: sono tre momenti
 * diversi. Senza questa finestra il quarto della giornata pagherebbe la pausa
 * lunga per colpa dei primi tre di due ore prima.
 */
export const WINDOW_MS = 120000

/** @typedef {{count: number, at: number}} CooldownState */

/** Lo stato di partenza: mai creato niente. */
export const EMPTY = { count: 0, at: 0 }

/** Lo stato ripulito di una serie ormai scaduta. */
function current(state, now) {
  // Si guarda `count` e non `at`: un'ora di sistema che vale zero e' assurda
  // nella realta' ma normalissima in una prova, e una funzione che si comporta
  // diversamente sotto prova non e' stata provata.
  if (!state || typeof state.count !== 'number' || state.count <= 0) return EMPTY
  if (now - state.at >= WINDOW_MS) return EMPTY
  return { count: state.count, at: state.at }
}

/** Il momento in cui si potra' creare il prossimo. */
export function readyAt(state, now) {
  const live = current(state, now)
  if (live.count === 0) return 0

  return live.at + (live.count >= BURST ? BURST_GAP_MS : GAP_MS)
}

/** Quanti millisecondi mancano. Zero se si puo' gia'. */
export function remaining(state, now) {
  return Math.max(0, readyAt(state, now) - now)
}

export function ready(state, now) {
  return remaining(state, now) === 0
}

/**
 * Lo stato dopo una creazione riuscita.
 *
 * Superata la raffica e passata la pausa lunga si riparte da uno, non da
 * quattro: altrimenti dopo il terzo alias ogni successivo pagherebbe per sempre
 * la pausa lunga.
 */
export function afterCreate(state, now) {
  const live = current(state, now)
  const count = live.count >= BURST ? 1 : live.count + 1
  return { count, at: now }
}

/**
 * Secondi che mancano, arrotondati per eccesso.
 *
 * Per eccesso perche' un bottone che dice "fra 0 secondi" ed e' ancora spento
 * ha appena mentito. Meglio dire uno e aprirsi mezzo secondo prima.
 */
export function secondsLeft(state, now) {
  return Math.ceil(remaining(state, now) / 1000)
}

/**
 * Come si racconta l'attesa, in una riga.
 *
 * Non e' un errore e non deve sembrarlo: non e' successo niente di sbagliato,
 * c'e' solo da aspettare. Il testo dice quanto, e la pausa lunga dice anche
 * perche', altrimenti sembra che il conto sia impazzito.
 */
export function describe(state, now) {
  const seconds = secondsLeft(state, now)
  if (seconds === 0) return ''

  const live = current(state, now)

  return live.count >= BURST
    ? `Three in a row. Ready in ${seconds}s`
    : `Ready in ${seconds}s`
}
