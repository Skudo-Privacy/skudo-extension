/**
 * Popup.
 *
 * Non parla mai con l'API: manda messaggi al contesto di sfondo, che e' l'unico
 * posto in cui il token esiste. Il popup non lo riceve nemmeno per mostrarlo.
 *
 * ## Due colonne
 *
 * L'elenco a sinistra, il dettaglio a destra. Un alias non e' una riga da
 * guardare, e' una cosa su cui si fanno tre o quattro operazioni: copiarlo,
 * dargli un nome, spegnerlo, buttarlo. In una colonna sola quelle operazioni o
 * stanno nascoste sotto un menu o seppelliscono gli indirizzi.
 *
 * ## Cosa non c'e', e non e' una dimenticanza
 *
 * Niente che riguardi l'indirizzo a cui la posta viene inoltrata. Il token
 * dell'estensione non puo' nemmeno chiederlo al server: vedi
 * AliasResource e TokenAbilities nel repo di Skudo.
 */

import { addressNode } from './shared/address.js'
import { api } from './shared/browser.js'

/**
 * Attesa minima prima di mostrare il risultato della creazione.
 *
 * Non e' un ritardo finto per far sembrare che stia lavorando: la chiamata vera
 * di solito ci mette meno, e senza questa il popup sfarfalla, la rotella appare
 * e sparisce nello stesso fotogramma, e chi ha premuto non capisce se ha
 * premuto. Sotto i duecento millisecondi un cambiamento di stato si legge come
 * un errore grafico, non come una risposta.
 */
const MIN_VISIBLE_WORK_MS = 450

const SEARCH_DEBOUNCE_MS = 250

const $ = (id) => document.getElementById(id)
const SVG_NS = 'http://www.w3.org/2000/svg'

/* ------------------------------------------------------------------ *
 * Stato
 * ------------------------------------------------------------------ */

let settings = null
let site = ''
let aliases = []
let selectedId = null
let searchTimer = null

/** L'ultima richiesta vinta: vedi la guardia contro le risposte in ritardo. */
let listRequest = 0

/* ------------------------------------------------------------------ *
 * Messaggi
 * ------------------------------------------------------------------ */

async function send(type, payload = {}) {
  const response = await api.runtime.sendMessage({ type, ...payload })
  if (!response?.ok) {
    const error = new Error(response?.error || 'Something went wrong.')
    error.code = response?.code
    throw error
  }
  return response.data
}

/* ------------------------------------------------------------------ *
 * Disegno
 * ------------------------------------------------------------------ */

function icon(paths, size = 16) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.9')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
  }
  return svg
}

const PATHS = {
  copy: [
    'M9.5 9.5h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 20v-9a1.5 1.5 0 0 1 1.5-1.5Z',
    'M5.5 15.5H5A1.5 1.5 0 0 1 3.5 14V5A1.5 1.5 0 0 1 5 3.5h9A1.5 1.5 0 0 1 15.5 5v.5',
  ],
  tick: ['m5 12.6 4.6 4.6L19.2 7.6'],
  mask: [
    'M3.6 8.4c3-1.2 5.7-1.2 8.4 0 2.7-1.2 5.4-1.2 8.4 0 0 5.4-2.1 8.4-4.5 8.4-1.6 0-2.7-1.1-3.9-2.6-1.2 1.5-2.3 2.6-3.9 2.6-2.4 0-4.5-3-4.5-8.4Z',
  ],
}

function show(name) {
  for (const screen of document.querySelectorAll('.screen')) {
    screen.hidden = screen.id !== `screen-${name}`
  }
  $('settings-toggle').setAttribute('aria-expanded', String(name === 'settings'))
}

function applyTheme(theme) {
  // `auto` non stampa niente e lascia decidere alla media query. Le altre due
  // vincono su di essa, che e' tutto il punto: su Mullvad e LibreWolf la media
  // query mente. Vedi popup.css.
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

function showError(message) {
  const el = $('create-error')
  el.textContent = message || ''
  el.hidden = !message
}

/* ------------------------------------------------------------------ *
 * L'elenco
 * ------------------------------------------------------------------ */

/** La parte prima della chiocciola: quella che distingue un alias da un altro. */
const localPart = (email) => email.slice(0, email.lastIndexOf('@')) || email

function aliasRow(alias) {
  const item = document.createElement('li')

  const button = document.createElement('button')
  button.type = 'button'
  button.className = alias.active ? 'row' : 'row is-off'
  button.setAttribute('aria-selected', String(alias.id === selectedId))
  button.dataset.id = alias.id

  const badge = document.createElement('span')
  badge.className = 'row__badge'
  badge.textContent = localPart(alias.email).charAt(0)
  badge.setAttribute('aria-hidden', 'true')
  button.appendChild(badge)

  const text = document.createElement('span')
  text.className = 'row__text'

  const title = document.createElement('span')
  title.className = 'row__title'
  title.textContent = localPart(alias.email)
  text.appendChild(title)

  const sub = document.createElement('span')
  sub.className = 'row__sub'
  sub.textContent = alias.description || alias.email.slice(alias.email.lastIndexOf('@'))
  text.appendChild(sub)

  button.appendChild(text)
  button.addEventListener('click', () => select(alias.id))

  item.appendChild(button)
  return item
}

function renderList() {
  const list = $('alias-list')
  list.textContent = ''
  for (const alias of aliases) list.appendChild(aliasRow(alias))

  const query = $('search').value.trim()
  const empty = $('list-empty')
  empty.hidden = aliases.length > 0
  empty.textContent = query
    ? `Nothing matching "${query}".`
    : site
      ? `No alias for ${site} yet.`
      : 'No aliases yet.'
}

/**
 * Carica l'elenco.
 *
 * La guardia sul numero di richiesta e' la stessa che serviva alla ricerca
 * globale dell'applicazione: una risposta lenta per una parola corta puo'
 * arrivare dopo quella di una parola piu' lunga scritta subito dopo, e
 * sovrascrivere il risultato giusto con quello vecchio.
 */
async function loadList() {
  const query = $('search').value.trim()
  const thisRequest = ++listRequest

  let next = []
  try {
    if (query) next = await send('SEARCH_ALIASES', { query })
    else if (site) next = await send('ALIASES_FOR_SITE', { site })
    else next = await send('RECENT_ALIASES')
  } catch (error) {
    if (thisRequest !== listRequest) return
    if (error.code === 'UNAUTHENTICATED') return show('signin')
    next = []
  }

  if (thisRequest !== listRequest) return

  aliases = next
  if (!aliases.some((alias) => alias.id === selectedId)) selectedId = null
  renderList()
  renderDetail()
}

function select(id) {
  selectedId = id
  renderList()
  renderDetail()
}

/* ------------------------------------------------------------------ *
 * Il dettaglio
 * ------------------------------------------------------------------ */

function blank() {
  const wrap = document.createElement('div')
  wrap.className = 'blank'

  const inner = document.createElement('div')
  inner.className = 'blank__inner'
  inner.appendChild(icon(PATHS.mask, 34))

  const title = document.createElement('h2')
  title.textContent = aliases.length ? 'Pick an alias' : 'No aliases yet'
  inner.appendChild(title)

  const body = document.createElement('p')
  body.textContent = aliases.length
    ? 'Choose one on the left to copy it, rename it, or turn it off.'
    : site
      ? `Create one and ${site} never learns your real address.`
      : 'Create one and give it out instead of your real address.'
  inner.appendChild(body)

  wrap.appendChild(inner)
  return wrap
}

/** Il blocco dell'indirizzo, con il bottone che lo copia. */
function addressBlock(alias) {
  const wrap = document.createElement('div')
  wrap.className = 'address'
  wrap.appendChild(addressNode(alias.email))

  const copy = document.createElement('button')
  copy.type = 'button'
  copy.className = 'icon-button'
  copy.title = 'Copy'
  copy.setAttribute('aria-label', `Copy ${alias.email}`)
  copy.appendChild(icon(PATHS.copy))
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(alias.email)
    } catch {
      // Il permesso puo' mancare: l'indirizzo resta selezionabile a mano, e
      // fingere che sia andata sarebbe peggio che non dire niente.
      return
    }
    copy.dataset.done = 'true'
    copy.textContent = ''
    copy.appendChild(icon(PATHS.tick))
    copy.title = 'Copied'
    setTimeout(() => {
      copy.dataset.done = 'false'
      copy.textContent = ''
      copy.appendChild(icon(PATHS.copy))
      copy.title = 'Copy'
    }, 1600)
  })
  wrap.appendChild(copy)

  return wrap
}


/** Una riga del blocco in fondo: etichetta a sinistra, valore o comando a destra. */
function detailRow(label, value) {
  const row = document.createElement('div')
  row.className = 'detail__row'
  const name = document.createElement('span')
  name.textContent = label
  row.append(name, value)
  return row
}

function receivingToggle(alias) {
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'toggle'
  toggle.setAttribute('role', 'switch')
  toggle.setAttribute('aria-checked', String(alias.active))
  toggle.setAttribute('aria-label', alias.active ? 'Turn off' : 'Turn on')

  toggle.addEventListener('click', async () => {
    const wanted = !alias.active
    try {
      await send('SET_ALIAS_ACTIVE', { id: alias.id, active: wanted })
    } catch (error) {
      return showError(error.message)
    }
    alias.active = wanted
    renderList()
    renderDetail()
  })

  return toggle
}

/**
 * La nota, modificabile sul posto.
 *
 * Si salva uscendo dal campo o premendo Invio, e non c'e' un bottone "Salva":
 * un campo con un bottone accanto fa credere che senza premerlo non succeda
 * niente, e chi chiude il popup pensando di aver scritto la nota la perde.
 */
function noteField(alias) {
  const input = document.createElement('input')
  input.type = 'text'
  input.maxLength = 200
  input.value = alias.description || ''
  input.placeholder = 'Add a note, like where you used it'
  input.id = 'detail-note'

  const save = async () => {
    const description = input.value.trim()
    if (description === (alias.description || '')) return
    try {
      await send('UPDATE_ALIAS', { id: alias.id, description })
    } catch (error) {
      return showError(error.message)
    }
    alias.description = description
    renderList()
  }

  input.addEventListener('blur', save)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur()
  })

  return input
}

/**
 * Cancellare, con la conferma dentro la stessa colonna.
 *
 * Non un `confirm()`: quello blocca il popup e su alcuni motori lo chiude del
 * tutto, e la conferma sparirebbe insieme alla finestra lasciando l'alias dov'e'.
 */
function deleteControl(alias, detail) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'button button--quiet button--danger'
  button.textContent = 'Delete alias'

  button.addEventListener('click', () => {
    const row = document.createElement('div')
    row.className = 'row-actions'

    const keep = document.createElement('button')
    keep.type = 'button'
    keep.className = 'button button--quiet'
    keep.textContent = 'Keep it'
    keep.addEventListener('click', () => renderDetail())

    const confirm = document.createElement('button')
    confirm.type = 'button'
    confirm.className = 'button button--quiet button--danger'
    confirm.textContent = 'Delete for good'
    confirm.addEventListener('click', async () => {
      confirm.disabled = true
      try {
        await send('DELETE_ALIAS', { id: alias.id })
      } catch (error) {
        return showError(error.message)
      }
      aliases = aliases.filter((entry) => entry.id !== alias.id)
      selectedId = null
      renderList()
      renderDetail()
    })

    row.append(keep, confirm)
    detail.querySelector('.detail__foot').replaceWith(row)
    row.className = 'row-actions detail__foot'
  })

  return button
}

function renderDetail() {
  const pane = $('detail')
  pane.textContent = ''

  const alias = aliases.find((entry) => entry.id === selectedId)
  if (!alias) {
    pane.appendChild(blank())
    return
  }

  const detail = document.createElement('div')
  detail.className = 'detail'

  /*
   * Niente etichetta sopra l'indirizzo.
   *
   * Un'etichetta che dice "Alias" sopra un indirizzo email e' una delle cose
   * che si aggiungono per riempire, e non dice niente che non si veda: chi ha
   * appena premuto una riga di alias sa cosa sta guardando. Lo stesso per la
   * nota, che ha gia' un segnaposto dentro il campo.
   */
  const head = document.createElement('div')
  head.className = 'detail__head'
  head.appendChild(addressBlock(alias))
  detail.appendChild(head)

  const note = document.createElement('div')
  note.className = 'detail__block'
  note.appendChild(noteField(alias))
  detail.appendChild(note)

  const rows = document.createElement('div')
  rows.className = 'detail__rows'

  rows.appendChild(detailRow('Receiving mail', receivingToggle(alias)))

  if (alias.createdAt) {
    const when = document.createElement('span')
    when.className = 'detail__value'
    when.textContent = formatDate(alias.createdAt)
    rows.appendChild(detailRow('Created', when))
  }

  detail.appendChild(rows)

  const foot = document.createElement('div')
  foot.className = 'detail__foot'
  foot.appendChild(deleteControl(alias, detail))
  detail.appendChild(foot)

  pane.appendChild(detail)
}

function formatDate(value) {
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ------------------------------------------------------------------ *
 * Creazione
 * ------------------------------------------------------------------ */

async function create() {
  const button = $('create')
  const label = button.querySelector('.button__label')
  const spinner = button.querySelector('.spinner')

  showError('')
  button.disabled = true
  label.textContent = 'Creating'
  spinner.hidden = false

  const started = Date.now()
  try {
    const alias = await send('CREATE_ALIAS', { site, fresh: true })
    const elapsed = Date.now() - started
    if (elapsed < MIN_VISIBLE_WORK_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_VISIBLE_WORK_MS - elapsed))
    }

    aliases = [alias, ...aliases.filter((entry) => entry.id !== alias.id)]
    selectedId = alias.id
    renderList()
    renderDetail()
    // La nota e' l'unica cosa che resta da decidere: si parte da li'.
    $('detail-note')?.focus()
  } catch (error) {
    showError(error.message)
    if (error.code === 'UNAUTHENTICATED') show('signin')
  } finally {
    button.disabled = false
    label.textContent = 'Create an alias'
    spinner.hidden = true
  }
}

/* ------------------------------------------------------------------ *
 * Impostazioni
 * ------------------------------------------------------------------ */

async function loadDomains(selected) {
  const select = $('opt-domain')
  select.textContent = ''

  let domains = []
  try {
    domains = await send('DOMAIN_OPTIONS')
  } catch {
    domains = [selected].filter(Boolean)
  }

  for (const domain of domains) {
    const option = document.createElement('option')
    option.value = domain
    option.textContent = domain
    option.selected = domain === selected
    select.appendChild(option)
  }
}

async function patch(key, value) {
  settings = await send('SET_SETTINGS', { patch: { [key]: value } })
}

/**
 * L'interruttore dell'icona nelle pagine e' anche la richiesta di permesso.
 *
 * `permissions.request()` su Firefox si puo' chiamare **solo** dentro un
 * gestore di un gesto dell'utente: se prima si aspetta una promessa, il gesto
 * e' scaduto e la richiesta viene rifiutata senza chiedere niente a nessuno.
 * Per questo qui non c'e' nessun `await` prima della chiamata.
 */
function onInjectToggle(event) {
  const wanted = event.target.checked

  if (!wanted) {
    patch('injectIcon', false)
    api.permissions.remove({ origins: ['<all_urls>'] })
    return
  }

  api.permissions
    .request({ origins: ['<all_urls>'] })
    .then((granted) => {
      $('opt-inject').checked = granted
      return patch('injectIcon', granted)
    })
    .catch(() => {
      $('opt-inject').checked = false
    })
}

/* ------------------------------------------------------------------ *
 * Avvio
 * ------------------------------------------------------------------ */

async function currentSite() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true })
  try {
    return new URL(tab.url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

async function init() {
  settings = await send('GET_STATE')
  applyTheme(settings.theme)

  $('opt-menu').checked = settings.contextMenu
  $('opt-describe').checked = settings.describeWithSite
  $('opt-format').value = settings.format
  $('opt-theme').value = settings.theme
  $('opt-inject').checked =
    settings.injectIcon && (await api.permissions.contains({ origins: ['<all_urls>'] }))

  if (!settings.signedIn) {
    show('signin')
    return
  }

  site = await currentSite()
  $('site').textContent = site
  show('main')

  await loadList()
  loadDomains(settings.domain)
}

/* Eventi ------------------------------------------------------------ */

$('settings-toggle').addEventListener('click', () => {
  const open = !$('screen-settings').hidden
  show(open ? (settings?.signedIn ? 'main' : 'signin') : 'settings')
})

/**
 * Il collegamento si svolge in una pagina dell'estensione, non qui.
 *
 * Il popup si chiude appena l'utente guarda un'altra scheda, e il flusso
 * richiede proprio quello: approvare su una pagina di Skudo. Vedi
 * src/connect.js.
 */
$('connect').addEventListener('click', async () => {
  await api.tabs.create({ url: api.runtime.getURL('connect.html') })
  window.close()
})

$('signout').addEventListener('click', async () => {
  await send('SIGN_OUT')
  await init()
  show('signin')
})

$('create').addEventListener('click', create)

$('search').addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadList, SEARCH_DEBOUNCE_MS)
})

$('opt-inject').addEventListener('change', onInjectToggle)
$('opt-menu').addEventListener('change', (e) => patch('contextMenu', e.target.checked))
$('opt-describe').addEventListener('change', (e) => patch('describeWithSite', e.target.checked))
$('opt-domain').addEventListener('change', (e) => patch('domain', e.target.value))
$('opt-format').addEventListener('change', (e) => patch('format', e.target.value))
$('opt-theme').addEventListener('change', (e) => {
  applyTheme(e.target.value)
  patch('theme', e.target.value)
})

init()
