/**
 * Popup.
 *
 * Non parla mai con l'API: manda messaggi al contesto di sfondo, che è l'unico
 * posto in cui il token esiste. Il popup non lo riceve nemmeno per mostrarlo.
 */

import { addressNode } from './shared/address.js'
import { api } from './shared/browser.js'

/**
 * Attesa minima prima di mostrare il risultato della creazione.
 *
 * Non è un ritardo finto per far sembrare che stia lavorando: la chiamata vera
 * di solito ci mette meno, e senza questa il popup sfarfalla: la rotella
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
 * copia da tenere allineata, e non serve `innerHTML`, che funzionerebbe ma è
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
  // L'indirizzo con la parte locale in evidenza e il dominio smorzato: vedi
  // src/shared/address.js per il perche'.
  const slot = $('draft-email')
  slot.textContent = ''
  slot.appendChild(addressNode(alias.email, 'address__inner'))
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
    await loadList()
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
    label.textContent = 'Create an alias'
    spinner.hidden = true
  }
}

/* ------------------------------------------------------------------ *
 * Elenco degli alias
 *
 * Un solo componente per due casi. Con un sito davanti mostra gli alias di
 * quel sito; senza, gli ultimi creati, che è la ragione per cui questo popup
 * viene aperto quando non si sta compilando niente: ritrovare l'indirizzo dato
 * a qualcuno.
 *
 * L'elenco non è mai completo, ed è voluto. Il server tiene un token
 * dell'estensione a venti righe per richiesta, perché l'elenco intero degli
 * alias è la mappa di ogni servizio a cui una persona è iscritta: se un token
 * viene rubato, quella mappa non deve venire via in una richiesta sola. Per
 * vedere tutto c'è l'applicazione.
 * ------------------------------------------------------------------ */

const SEARCH_DEBOUNCE_MS = 250

let searchTimer = null

/** L'ultima richiesta vinta. Vedi la guardia contro le risposte in ritardo. */
let listRequest = 0

/** Le icone del markup, clonate invece che riscritte. Vedi copyIcon(). */
function trashIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '17')
  svg.setAttribute('height', '17')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7m-7 0 .7 11a2 2 0 0 0 2 1.9h4.6a2 2 0 0 0 2-1.9L17 7')
  svg.appendChild(path)
  return svg
}

function iconButton(label, node, onClick) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'icon-button'
  button.setAttribute('aria-label', label)
  button.title = label
  button.appendChild(node)
  button.addEventListener('click', onClick)
  return button
}

/**
 * Una riga.
 *
 * Tre azioni e nessun menu: copiare, accendere o spegnere, cancellare. La
 * nota si modifica cliccandola. Non c'è niente che riguardi l'indirizzo di
 * inoltro, e non è una dimenticanza: il token dell'estensione non può nemmeno
 * chiederlo al server, quindi non c'è niente da mostrare qui.
 */
function aliasRow(alias, { onChanged }) {
  const item = document.createElement('li')
  item.className = 'row-alias'
  if (!alias.active) item.classList.add('is-off')

  const top = document.createElement('div')
  top.className = 'row-alias__top'

  const dot = document.createElement('span')
  dot.className = 'dot'
  dot.setAttribute('aria-hidden', 'true')
  top.appendChild(dot)

  top.appendChild(addressNode(alias.email))

  /*
   * Le azioni stanno sopra la riga, non dentro di essa.
   *
   * Erano nel flusso, e tre bottoni da trenta pixel si prendevano un terzo
   * della larghezza anche quando erano invisibili: `opacity: 0` nasconde, non
   * toglie spazio. L'effetto era che un indirizzo lungo si spezzava a meta'
   * della parte locale, cioe' esattamente del pezzo che lo identifica, per
   * fare posto a bottoni che nessuno stava guardando.
   */
  const tools = document.createElement('div')
  tools.className = 'row-alias__actions'

  tools.appendChild(
    iconButton(`Copy ${alias.email}`, copyIcon(), () => navigator.clipboard.writeText(alias.email))
  )

  tools.appendChild(
    iconButton(alias.active ? 'Turn off' : 'Turn on', powerIcon(), async () => {
      try {
        await send('SET_ALIAS_ACTIVE', { id: alias.id, active: !alias.active })
        alias.active = !alias.active
        item.classList.toggle('is-off', !alias.active)
        onChanged()
      } catch (error) {
        showError('create-error', error.message)
      }
    })
  )

  tools.appendChild(iconButton('Delete', trashIcon(), () => askToDelete()))

  item.appendChild(top)
  item.appendChild(tools)

  /* Nota: testo finché non lo si clicca, campo mentre lo si scrive. */
  const note = document.createElement('button')
  note.type = 'button'
  note.className = 'row-alias__note'
  note.textContent = alias.description || 'Add a note'
  note.addEventListener('click', () => {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'row-alias__note-input'
    input.maxLength = 200
    input.value = alias.description || ''

    const save = async () => {
      const description = input.value.trim()
      input.replaceWith(note)
      if (description === (alias.description || '')) return
      try {
        await send('UPDATE_ALIAS', { id: alias.id, description })
        alias.description = description
        note.textContent = description || 'Add a note'
      } catch (error) {
        showError('create-error', error.message)
      }
    }

    input.addEventListener('blur', save)
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.blur()
      if (event.key === 'Escape') input.replaceWith(note)
    })

    note.replaceWith(input)
    input.focus()
    input.select()
  })
  item.appendChild(note)

  /**
   * La conferma sta dentro la riga.
   *
   * `confirm()` bloccherebbe il popup, e su alcuni motori lo chiude del tutto:
   * la conferma sparirebbe insieme alla finestra, e l'alias resterebbe.
   */
  function askToDelete() {
    if (item.querySelector('.row-alias__confirm')) return

    const bar = document.createElement('div')
    bar.className = 'row-alias__confirm'

    const label = document.createElement('span')
    label.textContent = 'Delete this alias?'
    bar.appendChild(label)

    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'mini'
    cancel.textContent = 'Keep'
    cancel.addEventListener('click', () => bar.remove())
    bar.appendChild(cancel)

    const confirm = document.createElement('button')
    confirm.type = 'button'
    confirm.className = 'mini mini--danger'
    confirm.textContent = 'Delete'
    confirm.addEventListener('click', async () => {
      confirm.disabled = true
      try {
        await send('DELETE_ALIAS', { id: alias.id })
        item.remove()
        onChanged()
      } catch (error) {
        bar.remove()
        showError('create-error', error.message)
      }
    })
    bar.appendChild(confirm)

    item.appendChild(bar)
  }

  return item
}

function powerIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '17')
  svg.setAttribute('height', '17')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  arc.setAttribute('d', 'M7.5 6.7a6.5 6.5 0 1 0 9 0')
  const stem = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  stem.setAttribute('d', 'M12 3.5v7')
  svg.append(arc, stem)
  return svg
}

/**
 * Riempie l'elenco.
 *
 * La guardia sul numero di richiesta è la stessa che serviva alla ricerca
 * globale dell'applicazione: una risposta lenta per una parola corta può
 * arrivare dopo quella di una parola più lunga scritta subito dopo, e
 * sovrascrivere il risultato giusto con quello vecchio.
 */
async function loadList() {
  const query = $('search').value.trim()
  const heading = $('list-heading')
  const list = $('alias-list')

  const thisRequest = ++listRequest

  let aliases = []
  try {
    if (query) {
      heading.textContent = 'Results'
      aliases = await send('SEARCH_ALIASES', { query })
    } else if (site) {
      heading.textContent = 'Already on this site'
      aliases = await send('ALIASES_FOR_SITE', { site })
    } else {
      heading.textContent = 'Recent'
      aliases = await send('RECENT_ALIASES')
    }
  } catch (error) {
    if (thisRequest !== listRequest) return
    if (error.code === 'UNAUTHENTICATED') return show('signin')
    // Un elenco che non arriva non è un errore da sbattere in faccia: creare
    // funziona lo stesso, e il popup ha già un messaggio suo per i guasti veri.
    aliases = []
  }

  if (thisRequest !== listRequest) return

  list.textContent = ''
  for (const alias of aliases) {
    list.appendChild(aliasRow(alias, { onChanged: () => {} }))
  }

  $('list-empty').hidden = aliases.length > 0
  $('list-empty').textContent = query
    ? `Nothing matching "${query}".`
    : site
      ? 'No alias for this site yet.'
      : 'Nothing here yet.'
  $('list-note').hidden = aliases.length < 20
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

  // Senza un sito davanti il popup non è mutilato: cambia mestiere. Diventa
  // l'elenco dei propri alias, che è quello che serve quando lo si apre da una
  // scheda vuota. Il bottone resta, perché creare un alias da copiare a mano è
  // esattamente quello che si fa quando l'indirizzo va scritto altrove.
  $('site').textContent = site || 'Your aliases'
  $('create').querySelector('.button__label').textContent = 'Create an alias'

  show('main')

  loadList()
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
