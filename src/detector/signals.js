/**
 * Secondo strato: i segnali che fanno pensare che un campo sia un campo email,
 * e quanto pesa ciascuno.
 *
 * ## Da dove vengono i pesi
 *
 * I primi tre segnali e la costante di partenza non li abbiamo scelti noi: sono
 * i pesi appresi dal modello Fathom di Firefox Relay, addestrato da Mozilla su
 * un insieme di moduli reali etichettati a mano (MPL 2.0, vedi NOTICE.md). Sono
 * riportati alla cifra, perché un peso addestrato cambiato a occhio non è più un
 * peso addestrato.
 *
 * Il risultato più interessante di quel modello è controintuitivo: il segnale
 * più forte non è nessun attributo dell'input, è **il testo della `<label>`
 * associata** (10.19 contro 9.41). Il modulo lo scrive un umano per un altro
 * umano, e l'etichetta dice la verità più spesso dell'attributo `name`, che
 * spesso è il nome di una colonna di database scritto nel 2011.
 *
 * ## I segnali aggiunti da noi
 *
 * Quelli marcati `calibrated: false` sono nostri e messi a mano. Valgono meno di
 * quelli addestrati e vanno considerati provvisori: l'arbitro è il corpus di
 * moduli reali in test/detector/fixtures. Quando sarà abbastanza grande, questi
 * pesi vanno rifatti con una regressione vera invece che a giudizio.
 */

import { attr, labelTextsFor, nearbyText } from './dom.js'

/** Corrispondenza esatta: l'attributo è "email", non "customer_email_2". */
const EMAIL_EXACT = /^e-?mail(_?address)?$/i

/** Presenza in un testo libero. */
const EMAIL_LOOSE = /e-?mail/i

/** Il campo si chiama come un nome utente, che su molti siti è l'indirizzo. */
const USERNAME_LIKE = /^(username|user|userid|user_id|login|loginid|account|accountname)$/i

/** Oltre questi limiti un testo è una frase, non l'etichetta di un campo. */
const MAX_LABEL_LENGTH = 50
const MAX_LABEL_WORDS = 5

/**
 * Il testo assomiglia all'etichetta di un campo, o è prosa?
 *
 * Il solo limite di lunghezza non basta, ed è l'errore che fa addy.io. La frase
 * "We will never share your email with anyone" sta in 47 caratteri, passa il
 * taglio a 50, e trasforma in campo email qualunque casella le stia sotto: è
 * rassicurazione, non etichetta. Il numero di parole separa i due casi molto
 * meglio, perché un'etichetta vera arriva a "Enter your email address" e si
 * ferma lì.
 */
function looksLikeFieldLabel(text) {
  if (text.length === 0 || text.length >= MAX_LABEL_LENGTH) return false
  return text.split(/\s+/).length <= MAX_LABEL_WORDS
}

/**
 * @typedef {object} Signal
 * @property {string} name
 * @property {number} weight
 * @property {boolean} calibrated  se il peso viene da un addestramento vero
 * @property {(input: HTMLInputElement, context: object) => boolean} test
 */

/** @type {Signal[]} */
export const SIGNALS = [
  {
    name: 'attrsMatchEmailExactly',
    weight: 9.416913986206055,
    calibrated: true,
    test: (input) =>
      ['id', 'name'].some((name) => EMAIL_EXACT.test(attr(input, name))) ||
      attr(input, 'autocomplete')
        .split(/\s+/)
        .some((token) => EMAIL_EXACT.test(token)),
  },
  {
    name: 'placeholderMatchesEmail',
    weight: 6.740292072296143,
    calibrated: true,
    test: (input) =>
      ['placeholder', 'aria-label'].some((name) => {
        const value = attr(input, name)
        // Il filtro sulla forma del testo è nostro: senza, una frase di
        // rassicurazione che nomina la email accende il segnale su qualunque
        // campo le stia vicino. Vedi looksLikeFieldLabel.
        return looksLikeFieldLabel(value) && EMAIL_LOOSE.test(value)
      }),
  },
  {
    name: 'labelMatchesEmail',
    weight: 10.197700500488281,
    calibrated: true,
    test: (input, { labels }) =>
      labels.some((text) => looksLikeFieldLabel(text) && EMAIL_LOOSE.test(text)),
  },

  // — da qui in giù: nostri, non calibrati —

  {
    // "customer_email", "billing-email-address": non è una corrispondenza
    // esatta, ma è comunque il sito che ci dice cos'è il campo. È il segnale
    // su cui DuckDuckGo appoggia gran parte del proprio selettore.
    name: 'attrsContainEmail',
    weight: 5.0,
    calibrated: false,
    test: (input) =>
      ['id', 'name', 'data-testid'].some((name) => {
        const value = attr(input, name)
        return value.length > 0 && !EMAIL_EXACT.test(value) && EMAIL_LOOSE.test(value)
      }),
  },
  {
    // Moduli senza `<label>`, che sono tanti: si legge il testo attorno. Più
    // debole del segnale sull'etichetta vera perché il testo vicino può
    // riferirsi a un altro campo.
    name: 'nearbyTextMatchesEmail',
    weight: 4.0,
    calibrated: false,
    test: (input, { nearby }) => nearby.length > 0 && EMAIL_LOOSE.test(nearby),
  },
  {
    // Su una form di iscrizione, "username" è quasi sempre l'indirizzo email:
    // il sito chiede una cosa sola e la chiama in due modi. Su una form di
    // accesso invece può essere un nome utente vero e non si tocca, quindi il
    // segnale è legato all'intento del modulo.
    name: 'usernameOnSignupForm',
    weight: 3.5,
    calibrated: false,
    test: (input, { formIntent }) =>
      formIntent === 'signup' &&
      (attr(input, 'autocomplete').split(/\s+/).includes('username') ||
        ['name', 'id'].some((name) => USERNAME_LIKE.test(attr(input, name)))),
  },
  {
    // `inputmode="email"` è raro ma quando c'è è deliberato: qualcuno ha pensato
    // alla tastiera del telefono per quel campo.
    name: 'inputModeEmail',
    weight: 3.0,
    calibrated: false,
    test: (input) => attr(input, 'inputmode') === 'email',
  },
]

/** Costante di partenza del modello di Mozilla: senza segnali, un campo non è email. */
export const BIAS = -3.907843589782715

/**
 * Raccoglie una volta sola i dati costosi da leggere dal DOM, così i segnali non
 * li ricalcolano ciascuno per conto proprio.
 *
 * @param {HTMLInputElement} input
 * @param {string} formIntent
 */
export function buildContext(input, formIntent) {
  return {
    labels: labelTextsFor(input),
    nearby: nearbyText(input),
    formIntent,
  }
}
