/**
 * Content script: l'icona nei campi email, e il menu che ne esce.
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
 * pagina ferma. Qui c'e' un solo ciclo `requestAnimationFrame` condiviso, che
 * parte quando qualcosa puo' aver spostato le icone e si ferma da solo quando le
 * posizioni smettono di cambiare. A pagina ferma il costo e' zero.
 *
 * ## Un menu di righe, e poi un messaggio
 *
 * Premere l'icona apre un elenco di righe, non una scheda: vedi il commento in
 * content/ui.js sul perche'. Riempito il campo il menu ha finito e si chiude;
 * quello che resta da dire e' una riga in basso con l'indirizzo e "Undo", che
 * se ne va da sola.
 */

import { createIcon, createMenu, createToast, setTheme } from './content/ui.js'
import { foreignShift, iconPosition, iconSize, menuPosition } from './content/anchor.js'
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
 * IDLE_FRAMES_BEFORE_STOP fotogrammi immobili, cioe' venti, e il ricontrollo era
 * fissato a trenta. Su una pagina che si assesta subito il ciclo si fermava
 * prima di arrivarci, e il ricontrollo non avveniva mai.
 *
 * Conta perche' le altre estensioni iniettano la loro icona dopo di noi, spesso
 * di parecchie centinaia di millisecondi: quando la loro compariva, noi avevamo
 * gia' smesso di guardare.
 */
const SHIFT_RECHECK_MS = 400

/**
 * Quando risvegliarsi apposta dopo aver agganciato un campo, in millisecondi.
 *
 * Copre la finestra in cui le altre estensioni si montano. Sono quattro
 * risvegli in tre secondi e poi basta: non e' un ciclo, e su una pagina ferma
 * non lascia niente acceso.
 */
const SHIFT_WAKE_MS = [150, 500, 1200, 3000]

/** Quanto resta a schermo il messaggio dopo il riempimento. */
const TOAST_LIFE_MS = 7000

/**
 * Nodi che non possono contenere un campo, e ARIA che dice "sono un comando".
 *
 * Servono a non rifare la scansione per niente. Su un'applicazione a componenti
 * il DOM cambia in continuazione: un menu che si apre, un contatore che si
 * aggiorna, un'animazione. Senza questo filtro ogni singola mutazione
 * accendeva una scansione dell'intera pagina.
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

/** Un menu alla volta: due aperti insieme sono due decisioni in conflitto. */
let openMenu = null

/** Un messaggio alla volta, e il timer che lo spegne. */
let toast = null
let toastTimer = null

/** Il dominio del sito, senza `www`. */
const site = () => location.hostname.replace(/^www\./, '')

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
      closeMenuFor(entry)
      return true
    }
    return false
  }
  entry.icon.host.style.visibility = ''
  entry.icon.setSize(iconSize(rect))

  const now = performance.now()
  if (now - entry.shiftCheckedAt > SHIFT_RECHECK_MS) {
    entry.shiftCheckedAt = now
    const shift = foreignShift(entry.icon.host, rect, entry.input)
    // Uno spostamento che cambia e' movimento: il ciclo non deve spegnersi
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
  // allora la posizione e' una supposizione, e mostrarla vuol dire farla
  // saltare di venti pixel sotto gli occhi di chi sta leggendo la pagina.
  if (!entry.revealed && entry.shiftCheckedAt > 0) {
    entry.revealed = true
    entry.icon.setReady()
  }

  if (entry.menu) entry.menu.move(menuPosition(rect))
  if (toast && toast.anchor === entry) toast.ui.move(menuPosition(rect))

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
    : 'Skudo: hide your email address'
}

function attach(field) {
  const input = field.element
  if (tracked.has(input)) return

  const entry = {
    input,
    field,
    menu: null,
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
  closeMenuFor(entry)
  entry.icon.remove()
  tracked.delete(input)
}

/** Spegne tutto: usato quando l'utente zittisce l'estensione su questo sito. */
function detachAll() {
  for (const input of [...tracked.keys()]) detach(input)
  clearToast()
}

/* ------------------------------------------------------------------ *
 * Menu
 * ------------------------------------------------------------------ */

function closeMenuFor(entry) {
  if (!entry?.menu) return
  entry.menu.remove()
  entry.menu = null
  if (openMenu === entry) openMenu = null
}

function menuFor(entry) {
  if (openMenu && openMenu !== entry) closeMenuFor(openMenu)

  if (!entry.menu) {
    entry.menu = createMenu({
      onPause: async () => {
        closeMenuFor(entry)
        await send('PAUSE_SITE', { site: site() })
        detachAll()
      },
    })
    document.body.appendChild(entry.menu.host)
    entry.menu.move(menuPosition(entry.input.getBoundingClientRect()))
    openMenu = entry
  }
  return entry.menu
}

// Un clic fuori chiude il menu. In cattura, perche' molte pagine fermano gli
// eventi prima che risalgano.
document.addEventListener(
  'pointerdown',
  (event) => {
    if (!openMenu) return
    const path = event.composedPath?.() || []
    if (path.includes(openMenu.menu?.host) || path.includes(openMenu.icon.host)) return
    closeMenuFor(openMenu)
  },
  true
)

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openMenu) closeMenuFor(openMenu)
})

/* ------------------------------------------------------------------ *
 * Il messaggio dopo il riempimento
 * ------------------------------------------------------------------ */

function clearToast() {
  clearTimeout(toastTimer)
  toastTimer = null
  toast?.ui.remove()
  toast = null
}

function showToast(entry, alias) {
  clearToast()

  const ui = createToast({
    email: alias.email,
    life: TOAST_LIFE_MS,
    onUndo: () => {
      // Disfare vuol dire davvero disfare: il campo torna vuoto e l'alias
      // sparisce dall'elenco. Lasciarlo in giro riempirebbe l'account di
      // indirizzi mai usati, che e' la lamentela numero uno su questi
      // strumenti.
      setValue(entry.input, '')
      clearToast()
      send('DELETE_ALIAS', { id: alias.id })
    },
  })

  document.body.appendChild(ui.host)
  ui.move(menuPosition(entry.input.getBoundingClientRect()))
  toast = { ui, anchor: entry }
  toastTimer = setTimeout(clearToast, TOAST_LIFE_MS)
  schedule()
}

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
    // L'estensione e' stata aggiornata o disattivata mentre la pagina era
    // aperta: il canale non esiste piu'.
    return { ok: false, error: 'Skudo was reloaded. Refresh this page and try again.' }
  }
}

/** Riempie il campo, chiude il menu, e lascia il messaggio con "Undo". */
function completeWith(entry, alias) {
  setValue(entry.input, alias.email)
  closeMenuFor(entry)
  if (alias.reused) clearToast()
  else showToast(entry, alias)
}

/**
 * Apre il menu.
 *
 * Ogni stato e' un titolo e un elenco di righe. Il caricamento e l'errore non
 * sono schermate: sono il sottotitolo della riga che si e' premuta, sostituito
 * al suo posto, cosi' il menu non salta sotto il puntatore.
 */
async function activate(entry) {
  // Secondo clic sul menu aperto: si chiude, non si ricomincia.
  if (entry.menu) {
    closeMenuFor(entry)
    return
  }

  const menu = menuFor(entry)
  const where = site()

  if (entry.field.action === 'reuse') {
    const rows = menu.show('Email address', [
      {
        name: 'lookup',
        icon: menu.icons.reuse,
        title: `Aliases you gave ${where}`,
        sub: menu.waitingNode('Looking'),
        disabled: true,
      },
    ])

    const response = await send('ALIASES_FOR_SITE', { site: where })
    if (!entry.menu) return
    if (!response?.ok) return showFailure(entry, response)

    const aliases = response.data
    if (aliases.length === 0) return offerCreate(entry, menu, { firstTime: true })

    menu.show(
      'Email address',
      aliases
        .map((alias) => ({
          icon: menu.icons.mask,
          title: alias.email.split('@')[0],
          sub: alias.description || alias.email.slice(alias.email.indexOf('@')),
          aside: menu.icons.tick,
          onClick: () => completeWith(entry, { ...alias, reused: true }),
        }))
        .concat([
          {
            icon: menu.icons.plus,
            title: 'Make a new one instead',
            sub: `A fresh address for ${where}`,
            onClick: () => create(entry, menu, { fresh: true }),
          },
        ])
    )
    void rows
    return
  }

  offerCreate(entry, menu, {})
}

/** La riga che crea, piu' quella che riusa se in sessione ce n'e' gia' una. */
function offerCreate(entry, menu, { firstTime = false }) {
  menu.show('Email address', [
    {
      name: 'create',
      icon: menu.icons.mask,
      title: 'Hide my email',
      sub: firstTime
        ? `You have no alias for ${site()} yet`
        : 'A new address that forwards to your inbox',
      tone: 'accent',
      aside: menu.icons.plus,
      onClick: () => create(entry, menu, {}),
    },
  ])
}

async function create(entry, menu, { fresh = false }) {
  const handles = menu.show('Email address', [
    {
      name: 'create',
      icon: menu.icons.mask,
      title: 'Hide my email',
      sub: menu.waitingNode('Creating'),
      tone: 'accent',
      disabled: true,
    },
  ])

  entry.icon.setBusy(true)
  const response = await send('CREATE_ALIAS', { site: site(), fresh })
  entry.icon.setBusy(false)

  if (!entry.menu) return
  if (!response?.ok) return showFailure(entry, response, { retry: () => create(entry, menu, { fresh }) })

  void handles
  completeWith(entry, response.data)
}

/**
 * Il guasto, dentro una riga.
 *
 * Il contorno rosso che c'era prima significava insieme "non sei collegato",
 * "il limite e' finito" e "la rete non risponde", e nessuna delle tre si
 * capiva. Qui c'e' scritto cosa e' successo, e la riga stessa e' il rimedio.
 */
function showFailure(entry, response, { retry } = {}) {
  const menu = menuFor(entry)

  if (response?.code === 'UNAUTHENTICATED') {
    menu.show('Email address', [
      {
        icon: menu.icons.link,
        title: 'Connect Skudo',
        sub: 'One click, nothing to copy',
        tone: 'accent',
        aside: menu.icons.plus,
        onClick: () => {
          send('OPEN_CONNECT')
          closeMenuFor(entry)
        },
      },
    ])
    return
  }

  const message = response?.error || 'Skudo could not be reached'

  menu.show('Email address', [
    {
      icon: menu.icons.alert,
      title: 'No alias was created',
      sub: message,
      tone: 'warn',
      onClick: retry,
      disabled: !retry,
    },
    ...(retry
      ? [
          {
            icon: menu.icons.reuse,
            title: 'Try again',
            onClick: retry,
          },
        ]
      : []),
  ])
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
 * La scansione costa: si fa quando il browser e' libero, mai dentro un gestore
 * di eventi. `requestIdleCallback` non esiste su tutti i motori, e su quelli
 * con resistFingerprinting il tempo che riporta e' grossolano, quindi il
 * ripiego e' un timeout normale.
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

async function start() {
  // Il tema e la lista dei siti zittiti, chiesti una volta sola. Nessun segreto
  // passa di qui: e' la stessa risposta che riceve il popup, meno il token, che
  // non esce mai dal contesto di sfondo.
  const state = await send('GET_STATE')
  if (state?.ok) {
    setTheme(state.data.theme)
    // Un sito su cui l'utente ha detto di non suggerire non viene nemmeno
    // guardato: niente icone, niente scansione, niente osservatore.
    if ((state.data.pausedSites || []).includes(site())) return
  }

  scan()

  const wake = () => schedule()
  addEventListener('scroll', wake, { passive: true, capture: true })
  addEventListener('resize', wake, { passive: true })
  addEventListener('transitionend', wake, { passive: true, capture: true })
  addEventListener('animationend', wake, { passive: true, capture: true })

  new MutationObserver((mutations) => {
    // Il riposizionamento e' a buon mercato e serve comunque: qualunque
    // mutazione puo' aver spostato un campo.
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
