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
import { hostFromUrl, registrableDomain } from './shared/domain.js'
import { parseServerTime } from './shared/time.js'

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

const SEARCH_DEBOUNCE_MS = 200

/** Righe che il server restituisce al massimo a un token dell'estensione. */
const RESULT_LIMIT = 20

const $ = (id) => document.getElementById(id)

/**
 * Telefono o tavoletta: si decide dal puntatore, non dalla larghezza.
 *
 * La larghezza di un popup desktop la scegliamo noi (600), quindi una media
 * query sulla larghezza non distinguerebbe niente. Il puntatore grossolano e'
 * quello che dice "si tocca con un dito", ed e' la cosa che cambia le misure.
 * Il ripiego sul nome del browser copre i motori che non lo dichiarano.
 * Va fatto prima di disegnare qualunque cosa, per non vedere il layout saltare.
 */
const MOBILE =
  (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
  /Android|Mobile|iPhone|iPad/i.test(globalThis.navigator?.userAgent || '')
if (MOBILE) document.documentElement.classList.add('mobile')

/** Su mobile l'elenco e il dettaglio sono due passaggi: quale dei due si vede. */
function setView(view) {
  if (!MOBILE) return
  $('screen-main').dataset.view = view
  if (view === 'list') $('detail').scrollTop = 0
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/* ------------------------------------------------------------------ *
 * Stato
 * ------------------------------------------------------------------ */

let settings = null
let site = ''
let aliases = []

/**
 * L'elenco com'e' disegnato: sezioni con un titolo e le loro righe. `aliases` e'
 * la stessa lista appiattita, nell'ordine in cui compare, ed e' quella su cui
 * lavorano selezione e tastiera.
 *
 * @type {Array<{title: string, items: object[]}>}
 */
let groups = []
let selectedId = null
let searchTimer = null

/** Il messaggio dell'ultimo caricamento fallito dell'elenco, o vuoto. */
let listError = ''

/** L'ultima richiesta vinta: vedi la guardia contro le risposte in ritardo. */
let listRequest = 0

/**
 * Le icone gia' risolte, per dominio registrabile.
 *
 * Vive per l'apertura del popup e basta: la cache vera sta nel contesto di
 * sfondo (src/shared/icons.js), qui c'e' solo quello che serve a non chiedere
 * due volte la stessa cosa mentre la finestra e' aperta.
 *
 * @type {Record<string, string|null>}
 */
let icons = {}

/** Il temporizzatore che ridisegna il bottone durante l'attesa. */
let waitTimer = null

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
  at: ['M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8', 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
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
  // L'errore vive sotto l'elenco: se si e' nel dettaglio, su mobile non si
  // vedrebbe, quindi si torna all'elenco dove c'e'.
  if (message) setView('list')
  const el = $('create-error')
  el.textContent = message || ''
  el.hidden = !message
}

/* ------------------------------------------------------------------ *
 * L'elenco
 * ------------------------------------------------------------------ */

/** La parte prima della chiocciola: quella che distingue un alias da un altro. */
const localPart = (email) => email.slice(0, email.lastIndexOf('@')) || email

/** Il segno di un alias: icona del sito se c'e', altrimenti l'iniziale. */
function badgeFor(alias) {
  const badge = document.createElement('span')
  badge.className = 'row__badge'
  badge.setAttribute('aria-hidden', 'true')

  const root = registrableDomain(alias.site || '')
  if (root) {
    badge.textContent = localPart(alias.email).charAt(0)
    badge.dataset.site = root
    paintBadge(badge, root)
  } else {
    // Senza un sito non c'e' niente da riconoscere a colpo d'occhio, e una
    // lettera a caso sembrava un'icona rotta: la chiocciola dice cos'e'.
    badge.classList.add('row__badge--none')
    badge.appendChild(icon(PATHS.at, 16))
  }
  return badge
}

function aliasRow(alias, { sibling = false } = {}) {
  const item = document.createElement('li')

  const button = document.createElement('button')
  button.type = 'button'
  button.className = alias.active === false ? 'row is-off' : 'row'
  button.setAttribute('aria-selected', String(alias.id === selectedId))
  button.dataset.id = alias.id

  // Il segno a sinistra: l'icona del sito quando c'e', la prima lettera
  // dell'indirizzo quando non c'e'.
  //
  // La lettera non e' un ripiego provvisorio ed e' scritta comunque, sotto
  // l'icona: un'icona che non arriva (rete assente, sito senza favicon,
  // interruttore spento) lascia altrimenti un quadrato vuoto, e un elenco di
  // quadrati vuoti e' peggio di un elenco di lettere.
  const badge = badgeFor(alias)
  button.appendChild(badge)

  const text = document.createElement('span')
  text.className = 'row__text'

  const title = document.createElement('span')
  title.className = 'row__title'
  highlight(title, localPart(alias.email))
  text.appendChild(title)

  const sub = document.createElement('span')
  sub.className = 'row__sub'
  // Un alias che arriva da un dominio fratello dice da dove viene, sempre.
  // Su vons.com puo' comparire l'alias nato su safeway.com perche' e' lo
  // stesso account, ma senza scriverlo sarebbe un indirizzo apparso dal
  // nulla, e chi guarda non ha modo di capire perche' e' li'.
  highlight(sub, subline(alias, sibling))
  text.appendChild(sub)

  button.appendChild(text)
  button.addEventListener('click', () => {
    select(alias.id)
    setView('detail')
  })
  button.addEventListener('dblclick', () => copyAlias(alias, item.querySelector('.row__copy')))

  item.appendChild(button)

  // Copiare e' l'operazione piu' frequente: sta sulla riga, senza dover
  // aprire il dettaglio. E' un fratello del bottone e non un figlio, perche'
  // un bottone dentro un bottone non e' HTML valido.
  const copy = document.createElement('button')
  copy.type = 'button'
  copy.className = 'icon-button row__copy'
  copy.title = 'Copy address'
  copy.setAttribute('aria-label', `Copy ${alias.email}`)
  copy.appendChild(icon(PATHS.copy, 15))
  copy.addEventListener('click', () => copyAlias(alias, copy))
  item.appendChild(copy)

  return item
}

/**
 * La riga sotto il nome: quello che dice di piu' su quell'alias in questo
 * momento. Se la ricerca ha trovato l'alias dal sito e non dalla nota, si
 * mostra il sito: un risultato che non si capisce perche' sia li' sembra un
 * errore.
 */
function subline(alias, sibling) {
  if (sibling && elsewhere(alias)) return `Saved on ${registrableDomain(alias.site)}`

  const query = $('search').value.trim().toLowerCase()
  const note = alias.description || ''
  if (query && alias.site && !note.toLowerCase().includes(query) && alias.site.includes(query)) {
    return alias.site
  }
  return note || alias.site || alias.email.slice(alias.email.lastIndexOf('@'))
}

/**
 * Il testo, con la parte che corrisponde alla ricerca in evidenza.
 *
 * Nodi di testo e <mark>, mai innerHTML: la nota di un alias e' testo
 * dell'utente e puo' contenere qualunque cosa.
 */
function highlight(node, text) {
  const query = $('search').value.trim().toLowerCase()
  const at = query ? text.toLowerCase().indexOf(query) : -1
  if (at < 0) {
    node.textContent = text
    return
  }
  const mark = document.createElement('mark')
  mark.textContent = text.slice(at, at + query.length)
  node.append(text.slice(0, at), mark, text.slice(at + query.length))
}

/** Copia un alias e mostra la spunta sul bottone che ha chiesto la copia. */
function setCopyLabel(button, done) {
  button.textContent = ''
  if (button.classList.contains('address-copy')) {
    button.appendChild(icon(done ? PATHS.tick : PATHS.copy, 16))
    const label = document.createElement('span')
    label.textContent = done ? 'Copied' : 'Copy address'
    button.appendChild(label)
    return
  }
  const size = button.classList.contains('row__copy') ? 15 : 16
  button.appendChild(icon(done ? PATHS.tick : PATHS.copy, size))
  button.title = done ? 'Copied' : 'Copy address'
}

/**
 * Copia negli appunti, con un ripiego.
 *
 * Su alcuni browser per telefono `navigator.clipboard` esiste ma rifiuta dentro
 * una pagina di estensione. `execCommand('copy')` da un campo selezionato
 * funziona dentro un gesto dell'utente ovunque, ed e' quello che salva il tocco.
 */
async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* ripiego */
  }
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px'
  document.body.appendChild(field)
  field.select()
  field.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  field.remove()
  return ok
}

async function copyAlias(alias, button) {
  if (!(await writeClipboard(alias.email))) {
    // Il permesso puo' mancare: l'indirizzo resta selezionabile a mano, e
    // fingere che sia andata sarebbe peggio che non dire niente.
    return
  }
  rememberSiteFor(alias)
  if (!button) return
  clearTimeout(button._done)
  button.dataset.done = 'true'
  setCopyLabel(button, true)
  button._done = setTimeout(() => {
    button.dataset.done = 'false'
    setCopyLabel(button, false)
  }, 1600)
}

/**
 * Mette l'icona dentro un segno, se l'abbiamo.
 *
 * L'immagine e' un `data:` e non un indirizzo: se fosse un indirizzo, sarebbe
 * il browser a scaricarla di nuovo a ogni ridisegno. Vedi src/shared/icons.js.
 */
function paintBadge(badge, root) {
  const data = root ? icons[root] : null

  badge.querySelector('img')?.remove()
  badge.classList.toggle('has-icon', Boolean(data))

  if (!data) return

  const image = document.createElement('img')
  image.src = data
  image.alt = ''
  image.width = 18
  image.height = 18
  badge.appendChild(image)
}

/**
 * Chiede le icone di tutta la lista, in una volta sola.
 *
 * In una volta e non al passaggio del mouse: un caricamento pigro sarebbe piu'
 * efficiente e direbbe, a chi guarda il traffico, su quale riga si e' fermato
 * l'utente. Vedi il commento in cima a src/shared/icons.js.
 */
async function loadIcons(retry = false, attempt = 0) {
  if (!settings?.siteIcons) return

  const sites = [...new Set(aliases.map((alias) => alias.site).filter(Boolean))]
  if (sites.length === 0) return

  let reply
  try {
    reply = await send('SITE_ICONS', retry ? { sites, retry } : { sites })
  } catch {
    // Nessuna icona non e' un guasto: restano le lettere.
    return
  }

  // Il contesto di sfondo risponde con `{ icons, pending }`; si accetta anche
  // la mappa nuda, che e' la forma di prima.
  const resolved = reply?.icons ?? reply ?? {}
  icons = { ...icons, ...resolved }

  for (const badge of document.querySelectorAll('.row__badge[data-site]')) {
    paintBadge(badge, badge.dataset.site)
  }

  // Un'icona appena messa in coda arriva in pochi secondi: si ricontrolla
  // invece di lasciare la lettera fino alla prossima apertura.
  if (reply?.pending?.length && attempt < 3) {
    setTimeout(() => loadIcons(true, attempt + 1), 2500)
  }
}

function renderList() {
  const list = $('alias-list')
  const scroll = list.scrollTop
  list.textContent = ''

  for (const group of groups) {
    if (group.title) {
      const heading = document.createElement('li')
      heading.className = 'list__heading'
      heading.textContent = group.title
      heading.setAttribute('role', 'presentation')
      list.appendChild(heading)
    }
    // "Saved on" vale solo dentro la sezione del sito: e' li' che un alias di
    // un dominio fratello ha bisogno di dire da dove viene.
    const sibling = Boolean(site) && group.title === `On ${site}`
    for (const alias of group.items) list.appendChild(aliasRow(alias, { sibling }))
  }
  list.scrollTop = scroll

  const query = $('search').value.trim()
  const empty = $('list-empty')
  // Senza alias e senza ricerca il pannello a destra lo dice gia' meglio.
  empty.hidden = !listError && !(aliases.length === 0 && query)
  empty.textContent = listError
    ? `${listError} Try again in a moment.`
    : query
      ? `Nothing matching "${query}".`
      : 'No aliases yet.'
}

/**
 * L'alias appartiene a un sito diverso da quello che si sta guardando?
 *
 * Succede per i servizi con piu' domini e un account solo (safeway.com e
 * vons.com): l'elenco li mostra insieme, e quello che arriva da un fratello
 * va dichiarato. La regola di Apple per le password vale identica qui: una
 * cosa salvata altrove si puo' proporre, ma solo dicendo dove.
 */
function elsewhere(alias) {
  if (!site || !alias.site) return false

  return registrableDomain(alias.site) !== registrableDomain(site)
}

/** Il pulsante di svuotamento esiste solo quando c'e' qualcosa da svuotare. */
function syncSearchClear() {
  $('search-clear').hidden = $('search').value.trim() === ''
}

/**
 * Copiare un alias mentre si sta su un sito dice dove quell'alias viene
 * usato, e quel legame non lo avevamo mai raccolto per gli alias nati prima
 * della funzione: il loro elenco mostra una lettera al posto dell'icona,
 * per sempre, perche' nessuno ha mai scritto a quale sito appartengono.
 *
 * Tre condizioni, tutte necessarie. Solo se l'alias non ha ancora un sito
 * (non sovrascriviamo mai un legame esistente: chi copia un vecchio alias
 * su una pagina qualunque non deve spostarlo la'), solo se il popup e'
 * aperto su un sito vero, e solo se l'utente ha lasciato accesa
 * l'associazione automatica, che e' l'interruttore che significa esattamente
 * questo.
 */
async function rememberSiteFor(alias) {
  if (!site || alias.site || !settings?.associateSite) return

  const root = registrableDomain(site)
  if (!root) return

  try {
    await send('UPDATE_ALIAS', { id: alias.id, site, siteRoot: root })
  } catch {
    // Un'associazione mancata non e' un errore da mostrare: l'utente aveva
    // chiesto di copiare un indirizzo, e quello e' andato a buon fine.
    return
  }

  alias.site = site
  renderList()
  loadIcons()
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
    if (query) {
      const found = await send('SEARCH_ALIASES', { query })
      next = [
        {
          // Il server restituisce al massimo venti righe: dirlo, altrimenti
          // chi non trova un alias pensa che non esista.
          title:
            found.length >= RESULT_LIMIT
              ? `First ${RESULT_LIMIT} matches. Keep typing to narrow it down`
              : found.length === 1
                ? '1 match'
                : `${found.length} matches`,
          items: found,
        },
      ]
    } else {
      const [here, recent] = await Promise.all([
        site ? send('ALIASES_FOR_SITE', { site, includeInactive: true }) : [],
        send('RECENT_ALIASES'),
      ])
      const known = new Set(here.map((alias) => alias.id))
      const rest = recent.filter((alias) => !known.has(alias.id))
      next = [
        ...(here.length ? [{ title: `On ${site}`, items: here }] : []),
        { title: here.length && rest.length ? 'Recent' : '', items: rest },
      ]
    }
  } catch (error) {
    if (thisRequest !== listRequest) return
    if (error.code === 'UNAUTHENTICATED') return show('signin')
    // Un errore non e' "nessun risultato": dirlo come tale fa credere a chi
    // cerca che l'alias non esista.
    setGroups([])
    listError = error.message || 'Could not load your aliases.'
    renderList()
    renderDetail()
    return
  }

  if (thisRequest !== listRequest) return
  listError = ''
  setGroups(next.filter((group) => group.items.length || group.title))

  // Si apre con qualcosa di scelto: un pannello vuoto accanto a una lista
  // piena e' un passo in piu' per ogni uso. Solo se non c'e' gia' una scelta.
  if (!aliases.some((alias) => alias.id === selectedId)) selectedId = aliases[0]?.id ?? null
  renderList()
  renderDetail()
  loadIcons()
}

/** Imposta le sezioni e ricalcola la lista piatta. */
function setGroups(next) {
  groups = next
  aliases = next.flatMap((group) => group.items)
}

function select(id, { scroll = false } = {}) {
  selectedId = id
  renderList()
  renderDetail()
  if (scroll) document.querySelector('.row[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
}

/** Sposta la scelta di una riga, dalla tastiera, senza togliere il fuoco dalla ricerca. */
function moveSelection(step) {
  if (aliases.length === 0) return
  const at = aliases.findIndex((alias) => alias.id === selectedId)
  const next = Math.min(aliases.length - 1, Math.max(0, at + step))
  select(aliases[next].id, { scroll: true })
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

/** L'indirizzo in grande, e sotto il bottone che lo copia. */
function addressBlock(alias) {
  const wrap = document.createElement('div')
  wrap.className = 'address-wrap'

  const block = document.createElement('div')
  block.className = 'address'
  block.appendChild(addressNode(alias.email))
  wrap.appendChild(block)

  const copy = document.createElement('button')
  copy.type = 'button'
  copy.className = 'button button--primary address-copy'
  copy.setAttribute('aria-label', `Copy ${alias.email}`)
  setCopyLabel(copy, false)
  copy.addEventListener('click', () => copyAlias(alias, copy))
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
  const on = alias.active !== false
  toggle.setAttribute('aria-checked', String(on))
  toggle.setAttribute('aria-label', on ? 'Turn off' : 'Turn on')

  toggle.addEventListener('click', async () => {
    const wanted = alias.active === false
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
      setGroups(groups.map((group) => ({ ...group, items: group.items.filter((entry) => entry.id !== alias.id) })).filter((group) => group.items.length))
      selectedId = aliases[0]?.id ?? null
      renderList()
      renderDetail()
      setView('list')
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
    setView('list')
    return
  }

  const detail = document.createElement('div')
  detail.className = 'detail'

  // "Indietro" esiste solo su mobile (il CSS lo nasconde altrove): li' il
  // dettaglio copre l'elenco, e senza questo non c'e' modo di tornarci.
  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'detail__back'
  back.appendChild(icon(['M15 5l-7 7 7 7'], 20))
  const backLabel = document.createElement('span')
  backLabel.textContent = 'Aliases'
  back.appendChild(backLabel)
  back.addEventListener('click', () => setView('list'))
  detail.appendChild(back)

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

  // Chi e' questo alias, in una riga: il sito se lo conosciamo, e se riceve.
  const who = document.createElement('div')
  who.className = 'detail__who'
  const badge = badgeFor(alias)
  badge.classList.add('row__badge--lg')
  const whoText = document.createElement('div')
  whoText.className = 'detail__whotext'
  const whoName = document.createElement('strong')
  whoName.textContent = alias.site ? registrableDomain(alias.site) || alias.site : 'No site saved'
  if (!alias.site) whoName.className = 'is-dim'
  const whoState = document.createElement('span')
  whoState.className = alias.active === false ? 'state state--off' : 'state'
  whoState.textContent = alias.active === false ? 'Not receiving' : 'Receiving'
  whoText.append(whoName, whoState)
  who.append(badge, whoText)
  head.appendChild(who)

  head.appendChild(addressBlock(alias))
  detail.appendChild(head)

  const note = document.createElement('label')
  note.className = 'detail__block'
  const noteLabel = document.createElement('span')
  noteLabel.className = 'detail__label'
  noteLabel.textContent = 'Note'
  note.append(noteLabel, noteField(alias))
  detail.appendChild(note)

  const rows = document.createElement('div')
  rows.className = 'detail__rows'

  rows.appendChild(detailRow('Enabled', receivingToggle(alias)))

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
  const date = new Date(parseServerTime(value))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ------------------------------------------------------------------ *
 * Creazione
 * ------------------------------------------------------------------ */

/**
 * L'attesa fra un alias e il successivo, disegnata.
 *
 * ## Perche' il bottone non sparisce e non lampeggia
 *
 * Un bottone che scompare per sette secondi fa credere di aver rotto qualcosa.
 * Un bottone che resta identico e rifiuta il clic e' peggio ancora: sembra
 * guasto. Qui il bottone resta dov'e', dice quanto manca, e si riapre da solo.
 * Chi aspetta non deve fare niente e non deve chiedersi niente.
 *
 * ## Perche' il tempo si ricalcola invece di scorrere
 *
 * Ogni giro rilegge quanto manca dal contesto di sfondo invece di sottrarre un
 * secondo a una variabile. Un conto alla rovescia locale si scolla dalla realta'
 * appena il computer va in sospensione, e i browser rallentano di proposito i
 * temporizzatori delle finestre in secondo piano: il popup riaperto mostrerebbe
 * un numero inventato.
 *
 * ## Perche' lo stato non e' del popup
 *
 * Il popup si chiude appena si guarda un'altra scheda. Se il conteggio vivesse
 * qui, chiudere e riaprire azzererebbe il freno, cioe' lo toglierebbe proprio a
 * chi sta premendo piu' volte.
 */
async function refreshWait() {
  clearTimeout(waitTimer)

  const button = $('create')
  const label = button.querySelector('.button__label')
  const ring = $('create-wait')

  let state = { remaining: 0, label: '' }
  try {
    state = await send('COOLDOWN_STATE')
  } catch {
    // Senza risposta si lascia il bottone aperto: il freno vero e' comunque
    // sul server, e bloccarlo qui per un messaggio perso sarebbe un danno
    // gratuito.
  }

  if (state.remaining <= 0) {
    button.disabled = false
    button.removeAttribute('aria-disabled')
    label.textContent = 'Create an alias'
    ring.hidden = true
    showError('')
    return
  }

  button.disabled = true
  button.setAttribute('aria-disabled', 'true')
  label.textContent = state.label
  ring.hidden = false

  // Si riprende all'inizio del secondo successivo, non fra mille millisecondi
  // esatti: cosi' il numero cambia quando cambia davvero, invece di scivolare.
  waitTimer = setTimeout(refreshWait, (state.remaining % 1000) + 60)
}

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

    const rest = groups.map((group) => ({ ...group, items: group.items.filter((entry) => entry.id !== alias.id) }))
    setGroups([{ title: site ? `On ${site}` : '', items: [alias] }, ...rest.filter((group) => group.items.length)])
    selectedId = alias.id
    renderList()
    renderDetail()
    loadIcons()
    // La nota e' l'unica cosa che resta da decidere: si parte da li'. Su
    // mobile no: far salire la tastiera davanti all'indirizzo appena creato
    // lo coprirebbe proprio quando serve copiarlo.
    setView('detail')
    if (!MOBILE) $('detail-note')?.focus()
  } catch (error) {
    // L'attesa non e' un errore: non si scrive in rosso, si mostra sul bottone.
    if (error.code !== 'COOLDOWN') showError(error.message)
    if (error.code === 'UNAUTHENTICATED') show('signin')
  } finally {
    spinner.hidden = true
    // Chi decide se il bottone e' aperto e' il freno, non questa funzione:
    // riaprirlo qui e poi richiuderlo lo farebbe sfarfallare.
    await refreshWait()
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

  // Su Chromium il popup si chiude appena compare la richiesta di permesso:
  // il `.then` qui sotto non gira mai, e l'interruttore restava spento anche
  // dopo aver concesso. Quindi l'intenzione si salva *prima*, senza aspettarla
  // (niente `await` prima di `request`: vedi sopra). Il contesto di sfondo
  // registra lo script appena arriva il permesso (`permissions.onAdded`).
  patch('injectIcon', true)

  api.permissions
    .request({ origins: ['<all_urls>'] })
    .then((granted) => {
      $('opt-inject').checked = granted
      if (!granted) return patch('injectIcon', false)
      // Registra lo script e lo mette nelle schede gia' aperte.
      return send('ENABLE_FIELD_ICON').catch(() => {})
    })
    .catch(() => {
      $('opt-inject').checked = false
      patch('injectIcon', false)
    })
}

/* ------------------------------------------------------------------ *
 * Avvio
 * ------------------------------------------------------------------ */

async function currentSite() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true })
  // Solo i siti veri: `chrome://newtab` ha host `newtab`, che non e' un sito e
  // non deve finire ne' nell'intestazione ne' in una richiesta al server.
  return hostFromUrl(tab?.url)
}

async function init() {
  settings = await send('GET_STATE')
  applyTheme(settings.theme)

  $('opt-menu').checked = settings.contextMenu
  $('opt-describe').checked = settings.describeWithSite
  $('opt-associate').checked = settings.associateSite
  $('opt-icons').checked = settings.siteIcons
  $('opt-format').value = settings.format
  for (const radio of document.querySelectorAll('input[name="opt-theme"]')) {
    radio.checked = radio.value === settings.theme
  }
  const version = api.runtime.getManifest?.().version
  $('about-version').textContent = version ? `v${version}` : ''
  renderShortcut()
  $('opt-inject').checked =
    settings.injectIcon && (await api.permissions.contains({ origins: ['<all_urls>'] }))

  if (!settings.signedIn) {
    show('signin')
    return
  }

  site = await currentSite()
  $('site').textContent = site
  // Il sito non finisce piu' nella barra di ricerca: li' sembrava un filtro
  // che nasconde il resto, e la ricerca sembrava rotta. Ora e' una sezione
  // dell'elenco, sopra gli altri alias.
  syncSearchClear()
  renderPaused()
  show('main')

  await loadList()
  loadDomains(settings.domain)
  refreshWait()
}

/* Eventi ------------------------------------------------------------ */

$('settings-back').addEventListener('click', () => show(settings?.signedIn ? 'main' : 'signin'))

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
  syncSearchClear()
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadList, SEARCH_DEBOUNCE_MS)
})

$('search').addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') moveSelection(1)
  else if (event.key === 'ArrowUp') moveSelection(-1)
  else if (event.key === 'Enter') {
    const alias = aliases.find((entry) => entry.id === selectedId)
    if (alias) copyAlias(alias, document.querySelector('.row[aria-selected="true"] + .row__copy'))
  } else if (event.key === 'Escape' && event.target.value) {
    // Esc svuota; se e' gia' vuota lascia che il browser chiuda il popup.
    event.preventDefault()
    $('search-clear').click()
    return
  } else return
  event.preventDefault()
})

$('search-clear').addEventListener('click', () => {
  const field = $('search')
  field.value = ''
  syncSearchClear()
  field.focus()
  clearTimeout(searchTimer)
  loadList()
})

$('opt-inject').addEventListener('change', onInjectToggle)
$('opt-menu').addEventListener('change', (e) => patch('contextMenu', e.target.checked))
$('opt-describe').addEventListener('change', (e) => patch('describeWithSite', e.target.checked))
$('opt-associate').addEventListener('change', (e) => patch('associateSite', e.target.checked))
$('opt-icons').addEventListener('change', async (e) => {
  await patch('siteIcons', e.target.checked)
  // Spegnendolo le icone gia' disegnate devono sparire subito: un interruttore
  // che ha effetto solo alla prossima apertura sembra non aver funzionato.
  if (!e.target.checked) icons = {}
  renderList()
  loadIcons()
})
$('opt-domain').addEventListener('change', (e) => patch('domain', e.target.value))
$('opt-format').addEventListener('change', (e) => patch('format', e.target.value))
for (const radio of document.querySelectorAll('input[name="opt-theme"]')) {
  radio.addEventListener('change', () => {
    if (!radio.checked) return
    applyTheme(radio.value)
    patch('theme', radio.value)
  })
}

/* Sezioni ------------------------------------------------------------ */

function openTab(name) {
  for (const tab of document.querySelectorAll('.snav [data-tab]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.tab === name))
  }
  for (const panel of document.querySelectorAll('.spanel')) {
    panel.hidden = panel.dataset.panel !== name
  }
}

for (const tab of document.querySelectorAll('.snav [data-tab]')) {
  tab.addEventListener('click', () => openTab(tab.dataset.tab))
}

// Frecce su e giu' passano da una sezione all'altra, come in ogni elenco di
// schede.
$('screen-settings').querySelector('.snav').addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const tabs = [...document.querySelectorAll('.snav [data-tab]')]
  const here = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
  const next = tabs[(here + (event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length]
  openTab(next.dataset.tab)
  next.focus()
  event.preventDefault()
})

/* Scorciatoia -------------------------------------------------------- */

async function renderShortcut() {
  const box = $('shortcut-keys')
  box.textContent = ''
  let shortcut = ''
  try {
    const commands = await api.commands?.getAll?.()
    shortcut = commands?.find((command) => command.name === 'create_alias')?.shortcut || ''
  } catch {
    /* si mostra come non impostata */
  }

  if (!shortcut) {
    box.textContent = 'Not set'
    box.classList.add('keys--none')
    return
  }
  box.classList.remove('keys--none')
  for (const key of shortcut.split(/\+/)) {
    const cap = document.createElement('kbd')
    cap.textContent = key
    box.appendChild(cap)
  }
}

$('shortcut-change').addEventListener('click', async () => {
  try {
    // Firefox ha una chiamata apposta; su Chromium la pagina si apre da una scheda.
    if (api.commands?.openShortcutSettings) await api.commands.openShortcutSettings()
    else await api.tabs.create({ url: 'chrome://extensions/shortcuts' })
  } catch {
    /* il browser non lo permette: resta il comando scritto accanto */
  }
})

/* Siti in pausa ------------------------------------------------------ */

function renderPaused() {
  const list = $('paused-list')
  list.textContent = ''
  const paused = settings?.pausedSites || []

  for (const host of paused) {
    const item = document.createElement('li')
    const name = document.createElement('span')
    name.textContent = host
    const resume = document.createElement('button')
    resume.type = 'button'
    resume.className = 'chip-button'
    resume.textContent = 'Resume'
    resume.setAttribute('aria-label', `Resume on ${host}`)
    resume.addEventListener('click', async () => {
      await patch('pausedSites', paused.filter((entry) => entry !== host))
      renderPaused()
    })
    item.append(name, resume)
    list.appendChild(item)
  }

  $('paused-empty').hidden = paused.length > 0
  $('pause-here').hidden = !site || paused.includes(site)
  $('pause-here').textContent = site ? `Pause on ${site}` : 'Pause here'
}

$('pause-here').addEventListener('click', async () => {
  const paused = settings?.pausedSites || []
  if (!site || paused.includes(site)) return
  await patch('pausedSites', [...paused, site])
  renderPaused()
})

/* Cache delle icone e account --------------------------------------- */

$('clear-icons').addEventListener('click', async (event) => {
  const button = event.currentTarget
  try {
    await send('CLEAR_ICONS')
  } catch {
    return
  }
  icons = {}
  renderList()
  loadIcons()
  button.textContent = 'Cleared'
  setTimeout(() => (button.textContent = 'Clear'), 1600)
})

$('open-app').addEventListener('click', () => send('OPEN_APP').catch(() => {}))

init()
