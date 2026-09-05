/**
 * Content script: l'icona nei campi email.
 *
 * Gira su ogni pagina che l'utente apre, quindi ogni scelta qui si paga
 * moltiplicata per tutto il web.
 *
 * ## Niente token, niente rete
 *
 * Questo codice vive dentro la pagina di un sito qualunque, insieme al suo
 * JavaScript. Non legge il token e non parla con l'API: manda un messaggio al
 * contesto di sfondo e riceve una stringa. Un XSS sul sito ospite non trova
 * niente da rubare.
 *
 * ## Niente polling
 *
 * addy.io e SimpleLogin tengono un `setInterval(..., 200)` per ogni campo,
 * acceso per sempre: dieci campi fanno cinquanta risvegli al secondo su una
 * pagina ferma. Qui c'è un solo ciclo `requestAnimationFrame` condiviso, che
 * parte quando qualcosa può aver spostato le icone e si ferma da solo quando le
 * posizioni smettono di cambiare. A pagina ferma il costo è zero.
 *
 * ## Niente sovrapposizioni, e niente clic muti
 *
 * Chi ha anche Bitwarden o Proton Pass ha già un'icona in quell'angolo del
 * campo. Ci si sposta: vedi content/anchor.js. E ogni clic porta da qualche
 * parte, anche quando l'account non è ancora collegato: vedi content/ui.js.
 */

import { foreignShift, iconPosition, panelPosition } from './content/anchor.js'
import { createIcon, createPanel, setTheme } from './content/ui.js'
import { findEmailFields } from './detector/index.js'
import { api } from './shared/browser.js'

/** Quanti fotogrammi immobili prima di spegnere il ciclo. */
const IDLE_FRAMES_BEFORE_STOP = 20

/** Sotto questo scarto non si tocca il DOM: su Mullvad le misure sono arrotondate. */
const POSITION_EPSILON = 0.5

/**
 * Ogni quanto ricontrollare le icone altrui, in millisecondi.
 *
 * Era un conteggio di fotogrammi, ed era un difetto: il ciclo si spegne dopo
 * IDLE_FRAMES_BEFORE_STOP fotogrammi immobili, cioè venti, e il ricontrollo era
 * fissato a trenta. Su una pagina che si assesta subito il ciclo si fermava
 * prima di arrivarci, e il ricontrollo non avveniva mai.
 *
 * Conta perché le altre estensioni iniettano la loro icona dopo di noi, spesso
 * di parecchie centinaia di millisecondi: quando la loro compariva, noi avevamo
 * già smesso di guardare. È questo il motivo per cui l'icona continuava a
 * sovrapporsi nonostante lo spostamento funzionasse.
 */
const SHIFT_RECHECK_MS = 400

/**
 * Quando risvegliarsi apposta dopo aver agganciato un campo, in millisecondi.
 *
 * Copre la finestra in cui le altre estensioni si montano. Sono quattro
 * risvegli in tre secondi e poi basta: non è un ciclo, e su una pagina ferma
 * non lascia niente acceso.
 */
const SHIFT_WAKE_MS = [150, 500, 1200, 3000]

/**
 * Nodi che non possono contenere un campo, e ARIA che dice "sono un comando".
 *
 * Servono a non rifare la scansione per niente. Su un'applicazione a componenti
 * il DOM cambia in continuazione: un menu che si apre, un contatore che si
 * aggiorna, un'animazione. Senza questo filtro ogni singola mutazione
 * accendeva una scansione dell'intera pagina. Il filtro è la stessa idea che
 * Proton Pass usa nel proprio osservatore.
 */
const BARREN_TAGS = new Set([
  'SCRIPT',
  'NOSCRIPT',
  'STYLE',
  'LINK',
  'META',
  'TITLE',
  'PICTURE',
  'IMG',
  'VIDEO',
  'AUDIO',
  'CANVAS',
  'SVG',
  'PATH',
  'G',
  'BUTTON',
  'A',
  'OBJECT',
  'IFRAME',
  'BR',
  'HR',
])

const BARREN_ROLES = new Set(['button', 'link', 'menuitem', 'checkbox', 'radio', 'switch', 'tab'])

/** Vale la pena riguardare la pagina per questo nodo? */
function couldHoldFields(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false
  if (BARREN_TAGS.has(node.tagName)) return false

  const role = node.getAttribute?.('role')
  if (role && BARREN_ROLES.has(role)) return false

  if (node.tagName === 'INPUT' || node.tagName === 'FORM') return true

  // `shadowRoot` incluso: un componente che si monta ora porta i propri campi
  // dentro la propria radice, e da fuori il sottoalbero sembra vuoto.
  return Boolean(node.querySelector?.('input, form') || node.shadowRoot)
}

/** @type {Map<HTMLInputElement, object>} */
const tracked = new Map()

let rafId = null
let idleFrames = 0
let rescanHandle = null

/** Un pannello alla volta: due aperti insieme sono due decisioni in conflitto. */
let openPanel = null

/* ------------------------------------------------------------------ *
 * Ciclo di posizionamento, uno per tutti
 * ------------------------------------------------------------------ */

function schedule() {
  if (rafId !== null) return
  idleFrames = 0
  rafId = requestAnimationFrame(tick)
}

function tick() {
  let moved = false

  for (const [input, entry] of tracked) {
    if (!input.isConnected) {
      detach(input)
      moved = true
      continue
    }
    if (place(entry)) moved = true
  }

  idleFrames = moved ? 0 : idleFrames + 1

  if (tracked.size === 0 || idleFrames > IDLE_FRAMES_BEFORE_STOP) {
    rafId = null
    return
  }
  rafId = requestAnimationFrame(tick)
}

function place(entry) {
  const rect = entry.input.getBoundingClientRect()

  // Campo sparito dalla vista o rimpicciolito a niente: si nasconde l'icona
  // invece di lasciarla ancorata al nulla in mezzo alla pagina.
  if (rect.width === 0 || rect.height === 0) {
    if (entry.icon.host.style.visibility !== 'hidden') {
      entry.icon.host.style.visibility = 'hidden'
      closePanelFor(entry)
      return true
    }
    return false
  }
  entry.icon.host.style.visibility = ''

  // Le icone altrui compaiono quando vogliono, spesso dopo di noi. Si
  // ricontrolla ogni tanto, non a ogni fotogramma: costa una lettura di
  // layout.
  const now = performance.now()
  if (now - entry.shiftCheckedAt > SHIFT_RECHECK_MS) {
    entry.shiftCheckedAt = now
    const shift = foreignShift(entry.icon.host, rect, entry.input)
    // Uno spostamento che cambia è movimento: il ciclo non deve spegnersi
    // proprio mentre l'icona si sta togliendo di mezzo.
    if (Math.abs(shift - entry.shift) >= POSITION_EPSILON) {
      entry.shift = shift
      entry.moved = true
    }
  }

  const { left, top } = iconPosition(rect, entry.shift)
  const settled =
    Math.abs(left - entry.left) < POSITION_EPSILON && Math.abs(top - entry.top) < POSITION_EPSILON

  if (!settled) {
    entry.left = left
    entry.top = top
    entry.icon.move({ left, top })
  }

  // Si mostra solo dopo il primo controllo delle icone altrui. Prima di
  // allora la posizione è una supposizione, e mostrarla vuol dire farla
  // saltare di venti pixel sotto gli occhi di chi sta leggendo la pagina.
  if (!entry.revealed && entry.shiftCheckedAt > 0) {
    entry.revealed = true
    entry.icon.setReady()
  }

  if (entry.panel) entry.panel.move(panelPosition(rect))

  const moved = !settled || entry.moved
  entry.moved = false
  return moved
}

/* ------------------------------------------------------------------ *
 * Aggancio e sgancio
 * ------------------------------------------------------------------ */

function titleFor(field) {
  return field.action === 'reuse'
    ? 'Skudo: use an alias you already have here'
    : 'Skudo: make an alias for this site'
}

function attach(field) {
  const input = field.element
  if (tracked.has(input)) return

  const entry = {
    input,
    field,
    panel: null,
    left: NaN,
    top: NaN,
    shift: 0,
    shiftCheckedAt: -Infinity,
    revealed: false,
    moved: false,
    busy: false,
  }

  entry.icon = createIcon({
    title: titleFor(field),
    onActivate: () => activate(entry),
  })

  document.body.appendChild(entry.icon.host)
  tracked.set(input, entry)
  schedule()

  // Le altre estensioni arrivano dopo. Si torna a guardare qualche volta,
  // scadenzato, invece di tenere acceso un ciclo per tre secondi.
  for (const delay of SHIFT_WAKE_MS) {
    setTimeout(() => {
      if (!tracked.has(input)) return
      entry.shiftCheckedAt = -Infinity
      schedule()
    }, delay)
  }
}

function detach(input) {
  const entry = tracked.get(input)
  if (!entry) return
  closePanelFor(entry)
  entry.icon.remove()
  tracked.delete(input)
}

/* ------------------------------------------------------------------ *
 * Pannello
 * ------------------------------------------------------------------ */

function closePanelFor(entry) {
  if (!entry?.panel) return
  entry.panel.remove()
  entry.panel = null
  if (openPanel === entry) openPanel = null
}

function panelFor(entry) {
  if (openPanel && openPanel !== entry) closePanelFor(openPanel)

  if (!entry.panel) {
    entry.panel = createPanel({ site: site() })
    document.body.appendChild(entry.panel.host)
    entry.panel.move(panelPosition(entry.input.getBoundingClientRect()))
    openPanel = entry
  }
  return entry.panel
}

// Un clic fuori chiude il pannello. In cattura, perché molte pagine fermano gli
// eventi prima che risalgano.
document.addEventListener(
  'pointerdown',
  (event) => {
    if (!openPanel) return
    const path = event.composedPath?.() || []
    if (path.includes(openPanel.panel?.host) || path.includes(openPanel.icon.host)) return
    closePanelFor(openPanel)
  },
  true
)

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openPanel) closePanelFor(openPanel)
})

/* ------------------------------------------------------------------ *
 * Azione
 * ------------------------------------------------------------------ */

function setValue(input, value) {
  input.focus()
  input.value = value
  // I framework a componenti non guardano `value`, guardano gli eventi. Senza
  // questi due il campo appare pieno ma il modulo si invia vuoto.
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

async function send(type, payload = {}) {
  try {
    return await api.runtime.sendMessage({ type, ...payload })
  } catch {
    // L'estensione è stata aggiornata o disattivata mentre la pagina era
    // aperta: il canale non esiste più.
    return { ok: false, error: 'Skudo was reloaded. Refresh this page and try again.' }
  }
}

const site = () => location.hostname.replace(/^www\./, '')

async function activate(entry, { fresh = false } = {}) {
  if (entry.busy) return

  // Secondo clic sul pannello aperto: si chiude, non si ricomincia.
  if (entry.panel) {
    closePanelFor(entry)
    return
  }

  entry.busy = true
  entry.icon.setBusy(true)
  const panel = panelFor(entry)
  panel.working(entry.field.action === 'reuse' ? 'Looking for your alias…' : 'Making an alias…')

  const response =
    entry.field.action === 'reuse'
      ? await send('ALIASES_FOR_SITE', { site: site() })
      : await send('CREATE_ALIAS', { site: site(), fresh })

  entry.busy = false
  entry.icon.setBusy(false)

  if (!response?.ok) return showFailure(entry, response)

  if (entry.field.action === 'reuse') {
    const aliases = response.data
    if (!aliases.length) {
      // Non ne ha uno per questo sito: proporre il riuso sarebbe una
      // promessa a vuoto, quindi si offre di crearne uno.
      entry.field = { ...entry.field, action: 'create' }
      entry.icon.setTitle(titleFor(entry.field))
      closePanelFor(entry)
      return activate(entry)
    }

    panel.choose({
      aliases,
      onPick: (alias) => {
        setValue(entry.input, alias.email)
        closePanelFor(entry)
      },
      onDismiss: () => closePanelFor(entry),
    })
    return
  }

  const alias = response.data
  setValue(entry.input, alias.email)

  panel.created({
    email: alias.email,
    reused: alias.reused === true,
    onDone: () => closePanelFor(entry),
    // Un alias diverso per questo sito si ha solo chiedendolo: `fresh` passa
    // sopra alla memoria di sessione, e non lo fa nessun altro percorso.
    onFresh: () => {
      closePanelFor(entry)
      activate(entry, { fresh: true })
    },
    onUndo: () => {
      // Disfare vuol dire davvero disfare: il campo torna vuoto e l'alias
      // sparisce dall'elenco. Lasciarlo in giro riempirebbe l'account di
      // indirizzi mai usati, che è la lamentela numero uno su questi
      // strumenti.
      setValue(entry.input, '')
      closePanelFor(entry)
      send('DELETE_ALIAS', { id: alias.id })
    },
  })
}

function showFailure(entry, response) {
  const panel = panelFor(entry)

  if (response?.code === 'UNAUTHENTICATED') {
    // Era il bug peggiore della versione precedente: senza account collegato
    // il clic non faceva niente di visibile, e sembrava rotta.
    panel.signedOut({
      onConnect: () => {
        send('OPEN_CONNECT')
        closePanelFor(entry)
      },
      onDismiss: () => closePanelFor(entry),
    })
    return
  }

  panel.failed({
    message: response?.error || 'Skudo could not be reached.',
    onDismiss: () => closePanelFor(entry),
  })
}

/* ------------------------------------------------------------------ *
 * Scansione
 * ------------------------------------------------------------------ */

function scan() {
  for (const field of findEmailFields(document)) {
    // Il campo di conferma si compila ripetendo il primo, non con un alias
    // nuovo: nessuna icona.
    if (field.action === 'repeat') continue
    attach(field)
  }
}

/**
 * La scansione costa: si fa quando il browser è libero, mai dentro un gestore
 * di eventi. `requestIdleCallback` non esiste su tutti i motori, e su quelli
 * con resistFingerprinting il tempo che riporta è grossolano, quindi il
 * ripiego è un timeout normale.
 */
function scheduleScan() {
  if (rescanHandle !== null) return
  const run = () => {
    rescanHandle = null
    scan()
  }
  rescanHandle = globalThis.requestIdleCallback
    ? requestIdleCallback(run, { timeout: 1000 })
    : setTimeout(run, 300)
}

function start() {
  // Il tema, chiesto una volta sola. Nessun segreto passa di qui: e' la stessa
  // risposta che riceve il popup, meno il token, che non esce mai dal contesto
  // di sfondo.
  send('GET_STATE').then((response) => {
    if (response?.ok) setTheme(response.data.theme)
  })

  scan()

  const wake = () => schedule()
  addEventListener('scroll', wake, { passive: true, capture: true })
  addEventListener('resize', wake, { passive: true })
  addEventListener('transitionend', wake, { passive: true, capture: true })
  addEventListener('animationend', wake, { passive: true, capture: true })

  new MutationObserver((mutations) => {
    // Il riposizionamento è a buon mercato e serve comunque: qualunque
    // mutazione può aver spostato un campo.
    schedule()

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (couldHoldFields(node)) return scheduleScan()
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}
