/**
 * Popup.
 *
 * Non parla mai con l'API: manda messaggi al contesto di sfondo, che è l'unico
 * posto in cui il token esiste. Il popup non lo riceve nemmeno per mostrarlo.
 */

import { api } from './shared/browser.js'

/**
 * Attesa minima prima di mostrare il risultato della creazione.
 *
 * Non è un ritardo finto per far sembrare che stia lavorando: la chiamata vera
 * di solito ci mette meno, e senza questa il popup sfarfalla — la rotella
 * appare e sparisce nello stesso fotogramma, e l'utente non capisce se ha
 * premuto. Sotto i duecento millisecondi un cambiamento di stato si legge come
 * un errore grafico, non come una risposta.
 */
const MIN_VISIBLE_WORK_MS = 450

const $ = (id) => document.getElementById(id)

/**
 * L'icona di copia per l'elenco costruito da qui, presa dal markup invece che
 * riscritta: è la stessa azione della scheda della bozza e deve essere lo
 * stesso disegno. Si clona il nodo che già esiste, così non c'è una seconda
 * copia da tenere allineata, e non serve `innerHTML` — che funzionerebbe, ma è
 * la prima cosa che un revisore degli store va a cercare.
 */
function copyIcon() {
  return document.querySelector('#copy svg').cloneNode(true)
}

/** @type {{id: string, email: string, description: string}|null} */
let draft = null
let state = null
let site = ''

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
 * Schermate
 * ------------------------------------------------------------------ */

function show(name) {
  for (const screen of document.querySelectorAll('.screen')) {
    screen.hidden = screen.id !== `screen-${name}`
  }
  $('settings-toggle').setAttribute('aria-expanded', String(name === 'settings'))
}

function applyTheme(theme) {
  // `auto` non stampa niente e lascia decidere alla media query. Le altre due
  // vincono su di essa, che è tutto il punto: su Mullvad e LibreWolf la media
  // query mente. Vedi popup.css.
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

function showError(id, message) {
  const el = $(id)
  el.textContent = message || ''
  el.hidden = !message
}

/* ------------------------------------------------------------------ *
 * Bozza
 *
 * L'alias esiste sul server appena creato, non c'è modo di fare altrimenti.
 * Quello che resta in sospeso è la nota: finché non si preme Done non viene
 * salvata, e Discard cancella l'alias del tutto. Così premere "Crea" non è un
 * impegno.
 * ------------------------------------------------------------------ */

function openDraft(alias) {
  draft = alias
  $('draft-email').textContent = alias.email
  $('draft-description').value = alias.description || ''
  $('draft').hidden = false
  $('draft-description').focus()
}

function closeDraft() {
  draft = null
  $('draft').hidden = true
}

async function commitDraft() {
  if (!draft) return
  const description = $('draft-description').value.trim()
  try {
    if (description !== (draft.description || '')) {
      await send('UPDATE_ALIAS', { id: draft.id, description })
    }
    closeDraft()
    await loadExisting()
  } catch (error) {
    showError('create-error', error.message)
  }
}

async function discardDraft() {
  if (!draft) return
  const { id } = draft
  closeDraft()
  try {
    await send('DELETE_ALIAS', { id })
  } catch (error) {
    showError('create-error', error.message)
  }
}

/* ------------------------------------------------------------------ *
 * Creazione
 * ------------------------------------------------------------------ */

async function create() {
  const button = $('create')
  const label = button.querySelector('.button__label')
  const spinner = button.querySelector('.spinner')

  showError('create-error', '')
  button.disabled = true
  label.textContent = 'Creating'
  spinner.hidden = false

  const started = Date.now()
  try {
    const alias = await send('CREATE_ALIAS', { site })
    const elapsed = Date.now() - started
    if (elapsed < MIN_VISIBLE_WORK_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_VISIBLE_WORK_MS - elapsed))
    }
    openDraft(alias)
  } catch (error) {
    showError('create-error', error.message)
    if (error.code === 'UNAUTHENTICATED') show('signin')
  } finally {
    button.disabled = false
    label.textContent = 'Create alias'
    spinner.hidden = true
  }
}

/* ------------------------------------------------------------------ *
 * Alias già esistenti per il sito
 * ------------------------------------------------------------------ */

async function loadExisting() {
  if (!site) return
  let aliases = []
  try {
    aliases = await send('ALIASES_FOR_SITE', { site })
  } catch {
    // Un elenco che non arriva non è un errore da mostrare: la creazione
    // funziona lo stesso, e il popup ha già un messaggio suo per i guasti veri.
    return
  }

  const list = $('existing-list')
  list.textContent = ''

  for (const alias of aliases) {
    const item = document.createElement('li')

    const code = document.createElement('code')
    code.textContent = alias.email
    item.appendChild(code)

    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'icon-button'
    copy.appendChild(copyIcon())
    copy.setAttribute('aria-label', `Copy ${alias.email}`)
    copy.addEventListener('click', () => navigator.clipboard.writeText(alias.email))
    item.appendChild(copy)

    list.appendChild(item)
  }

  $('existing').hidden = aliases.length === 0
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
  state = await send('SET_SETTINGS', { patch: { [key]: value } })
}

/**
 * L'interruttore dell'icona nelle pagine è anche la richiesta di permesso.
 *
 * `permissions.request()` su Firefox si può chiamare **solo** dentro un gestore
 * di un gesto dell'utente: se prima si aspetta una promessa, il gesto è
 * scaduto e la richiesta viene rifiutata senza chiedere niente a nessuno. Per
 * questo qui non c'è nessun `await` prima della chiamata.
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
  state = await send('GET_STATE')
  applyTheme(state.theme)

  $('instance').value = state.instance
  $('opt-menu').checked = state.contextMenu
  $('opt-describe').checked = state.describeWithSite
  $('opt-format').value = state.format
  $('opt-theme').value = state.theme
  $('opt-inject').checked =
    state.injectIcon && (await api.permissions.contains({ origins: ['<all_urls>'] }))

  if (!state.signedIn) {
    show('signin')
    return
  }

  site = await currentSite()
  $('site').textContent = site || 'No site open'
  show('main')

  loadExisting()
  loadDomains(state.domain)
}

/* Eventi ------------------------------------------------------------ */

$('settings-toggle').addEventListener('click', () => {
  const settingsOpen = !$('screen-settings').hidden
  show(settingsOpen ? (state?.signedIn ? 'main' : 'signin') : 'settings')
})

/**
 * Il collegamento si svolge in una pagina dell'estensione, non qui.
 *
 * Il popup si chiude appena l'utente guarda un'altra scheda, e il flusso
 * richiede proprio quello: leggere un codice qui e confrontarlo là. Vedi
 * src/connect.js.
 */
$('connect').addEventListener('click', async () => {
  await api.tabs.create({ url: api.runtime.getURL('connect.html') })
  window.close()
})

$('signin').addEventListener('click', async () => {
  const button = $('signin')
  showError('signin-error', '')
  button.disabled = true
  try {
    await send('SIGN_IN', { instance: $('instance').value.trim(), token: $('token').value.trim() })
    $('token').value = ''
    await init()
  } catch (error) {
    showError('signin-error', error.message)
  } finally {
    button.disabled = false
  }
})

$('signout').addEventListener('click', async () => {
  await send('SIGN_OUT')
  await init()
  show('signin')
})

$('create').addEventListener('click', create)
$('draft-done').addEventListener('click', commitDraft)
$('draft-discard').addEventListener('click', discardDraft)
$('copy').addEventListener('click', () => {
  if (draft) navigator.clipboard.writeText(draft.email)
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
