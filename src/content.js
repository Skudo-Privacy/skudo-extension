/**
 * Content script: l'icona nei campi email.
 *
 * Gira su ogni pagina che l'utente apre, quindi ogni scelta qui si paga
 * moltiplicata per tutto il web. Due conseguenze che guidano il file intero.
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
 * addy.io e SimpleLogin tengono un `setInterval(..., 200)` **per ogni campo**,
 * acceso per sempre. Dieci campi fanno cinquanta risvegli al secondo su una
 * pagina ferma, all'infinito: è il motivo per cui queste estensioni si sentono
 * sulla ventola.
 *
 * Qui c'è un solo ciclo `requestAnimationFrame`, condiviso da tutte le icone,
 * che parte quando qualcosa può averle spostate (scorrimento, ridimensionamento,
 * mutazione, fine di una transizione) e si ferma da solo quando le posizioni
 * smettono di cambiare. A pagina ferma il costo è zero.
 */

import { findEmailFields } from './detector/index.js'
import { api } from './shared/browser.js'

/** Quanti fotogrammi immobili prima di spegnere il ciclo. */
const IDLE_FRAMES_BEFORE_STOP = 20

/** Sotto questo scarto non si tocca il DOM: su Mullvad le misure sono arrotondate. */
const POSITION_EPSILON = 0.5

const ICON_SIZE = 20
const ICON_INSET = 6

/**
 * L'icona come data URL.
 *
 * Non `chrome-extension://…`: la Content Security Policy di molti siti blocca
 * le origini esterne anche per le immagini, e l'icona non comparirebbe senza
 * nessun errore visibile. È il modo in cui addy.io ha risolto lo stesso
 * problema, ed è giusto.
 */
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<rect width="24" height="24" rx="5.4" fill="#0F5E56"/>
<g fill="#fff">
<rect x="7.0" y="6.8" width="11.7" height="2.4" rx="1.2"/>
<circle cx="6.0" cy="9.9" r="1.2"/>
<rect x="7.0" y="11.2" width="9.9" height="2.3" rx="1.15"/>
<circle cx="18.0" cy="13.9" r="1.2"/>
<rect x="4.9" y="14.8" width="12.1" height="2.3" rx="1.15"/>
</g>
</svg>`
const ICON_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON_SVG)}`

/** @type {Map<HTMLInputElement, {wrapper: HTMLElement, field: object, left: number, top: number}>} */
const tracked = new Map()

let rafId = null
let idleFrames = 0
let rescanHandle = null

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
      remove(input)
      moved = true
      continue
    }
    if (place(input, entry)) moved = true
  }

  idleFrames = moved ? 0 : idleFrames + 1

  if (tracked.size === 0 || idleFrames > IDLE_FRAMES_BEFORE_STOP) {
    rafId = null
    return
  }
  rafId = requestAnimationFrame(tick)
}

/**
 * Mette l'icona sopra il bordo destro del campo.
 * @returns {boolean} se qualcosa si è mosso davvero
 */
function place(input, entry) {
  const rect = input.getBoundingClientRect()

  // Campo sparito dalla vista o rimpicciolito a niente: si nasconde l'icona
  // invece di lasciarla ancorata al nulla in mezzo alla pagina.
  if (rect.width === 0 || rect.height === 0) {
    if (!entry.wrapper.hidden) {
      entry.wrapper.hidden = true
      return true
    }
    return false
  }
  if (entry.wrapper.hidden) entry.wrapper.hidden = false

  const left = rect.right + window.scrollX - ICON_SIZE - ICON_INSET
  const top = rect.top + window.scrollY + (rect.height - ICON_SIZE) / 2

  if (
    Math.abs(left - entry.left) < POSITION_EPSILON &&
    Math.abs(top - entry.top) < POSITION_EPSILON
  ) {
    return false
  }

  entry.left = left
  entry.top = top
  entry.wrapper.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
  return true
}

/* ------------------------------------------------------------------ *
 * Icone
 * ------------------------------------------------------------------ */

function buildIcon(field) {
  const wrapper = document.createElement('div')
  // Tutti gli stili in linea e con `all: initial` in testa: il foglio di stile
  // del sito ospite non deve poter deformare la nostra icona, e noi non
  // dobbiamo iniettare regole che deformino la sua pagina.
  wrapper.style.cssText = [
    'all: initial',
    'position: absolute',
    'top: 0',
    'left: 0',
    `width: ${ICON_SIZE}px`,
    `height: ${ICON_SIZE}px`,
    'z-index: 2147483646',
    'cursor: pointer',
    'display: block',
  ].join(';')

  const img = document.createElement('img')
  img.src = ICON_URL
  img.width = ICON_SIZE
  img.height = ICON_SIZE
  img.alt = ''
  img.style.cssText = 'width:100%;height:100%;display:block;opacity:0.75'
  wrapper.appendChild(img)

  wrapper.setAttribute('role', 'button')
  wrapper.setAttribute('tabindex', '0')
  wrapper.title =
    field.action === 'reuse'
      ? 'Skudo: use an alias you already have for this site'
      : 'Skudo: create an alias for this site'

  wrapper.addEventListener('mouseenter', () => (img.style.opacity = '1'))
  wrapper.addEventListener('mouseleave', () => (img.style.opacity = '0.75'))

  return wrapper
}

function attach(field) {
  const input = field.element
  if (tracked.has(input)) return

  const wrapper = buildIcon(field)
  wrapper.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    activate(field, wrapper)
  })

  document.body.appendChild(wrapper)
  tracked.set(input, { wrapper, field, left: NaN, top: NaN })
  schedule()
}

function remove(input) {
  const entry = tracked.get(input)
  if (!entry) return
  entry.wrapper.remove()
  tracked.delete(input)
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

function flash(wrapper, ok) {
  wrapper.style.outline = `2px solid ${ok ? '#C6EA33' : '#FF3B30'}`
  wrapper.style.outlineOffset = '2px'
  setTimeout(() => {
    wrapper.style.outline = ''
  }, 1200)
}

async function activate(field, wrapper) {
  const site = location.hostname.replace(/^www\./, '')

  // Su un modulo di accesso non si crea niente di nuovo: si cerca quello che
  // l'utente ha già. È la ragione per cui il rilevatore misura l'intento del
  // modulo. Vedi src/detector/form-intent.js.
  const message =
    field.action === 'reuse' ? { type: 'ALIASES_FOR_SITE', site } : { type: 'CREATE_ALIAS', site }

  wrapper.style.opacity = '0.4'
  let response
  try {
    response = await api.runtime.sendMessage(message)
  } catch {
    // L'estensione è stata aggiornata o disattivata mentre la pagina era
    // aperta: il canale non esiste più.
    response = { ok: false }
  }
  wrapper.style.opacity = ''

  if (!response?.ok) {
    flash(wrapper, false)
    return
  }

  if (field.action === 'reuse') {
    const [existing] = response.data
    if (!existing) {
      flash(wrapper, false)
      return
    }
    setValue(field.element, existing.email)
  } else {
    setValue(field.element, response.data.email)
  }

  flash(wrapper, true)
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
 * con resistFingerprinting il tempo che riporta è grossolano, quindi il ripiego
 * è un timeout normale.
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
  scan()

  // Ogni cosa che può aver spostato un campo riaccende il ciclo. `passive` e
  // `capture` per non ritardare lo scorrimento della pagina ospite.
  const wake = () => schedule()
  addEventListener('scroll', wake, { passive: true, capture: true })
  addEventListener('resize', wake, { passive: true })
  addEventListener('transitionend', wake, { passive: true, capture: true })
  addEventListener('animationend', wake, { passive: true, capture: true })

  new MutationObserver(() => {
    schedule()
    scheduleScan()
  }).observe(document.documentElement, { childList: true, subtree: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}
