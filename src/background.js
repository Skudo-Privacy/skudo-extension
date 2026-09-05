/**
 * Contesto di sfondo: l'unico posto in cui il token esiste.
 *
 * Gira come service worker su Chromium e come event page su Gecko, dallo stesso
 * file (vedi docs/BROWSERS.md). Entrambi vengono spenti quando sono inattivi,
 * quindi qui non c'è stato in memoria che si presuma vivo: tutto quello che
 * deve sopravvivere sta in `storage`.
 */

import { ApiError, SkudoApi, aliasEmail } from './shared/api.js'
import { api } from './shared/browser.js'
import { INSTANCE } from './shared/config.js'
import { forgetSecret, rememberSecret, readSecret } from './shared/pairing.js'
import { clearToken, getSettings, getToken, setSettings, setToken } from './shared/storage.js'

const CONTEXT_MENU_ID = 'skudo-create-alias'

/**
 * Gli alias creati da poco, gli unici che il content script può cancellare.
 *
 * Il pannello offre "Undo" subito dopo aver creato un alias, e per farlo deve
 * poterlo cancellare. Ma il content script gira dentro la pagina di un sito
 * qualunque: dargli un verbo che cancella *qualsiasi* alias per identificativo
 * significa che basta un modo per fargli mandare un messaggio, un bug
 * nostro o un domani un'API del browser meno isolata, per svuotare l'account.
 *
 * Quindi la cancellazione vale solo per quello che quel tab ha appena creato, e
 * solo per pochi minuti. È tutto quello che serve a "Undo".
 */
const UNDOABLE_KEY = 'undoableAliases'
const UNDO_WINDOW_MS = 5 * 60 * 1000
const CONTENT_SCRIPT_ID = 'skudo-field-icon'

/**
 * L'alias già dato a un sito in questa sessione del browser.
 *
 * Senza questo, ogni pressione dell'icona creava un indirizzo nuovo. Su un
 * modulo con due campi, o su chi ripreme perché non ha visto il pannello, si
 * arriva a cinque alias per una sola iscrizione: l'elenco dell'utente si
 * riempie di indirizzi che non riceveranno mai niente, e non c'è modo di
 * sapere quale dei cinque ha dato davvero al sito.
 *
 * Un sito, un alias, finché il browser resta aperto. Cambiarlo resta possibile,
 * ma deve essere una scelta esplicita: vedi il parametro `fresh`.
 *
 * `storage.session` e non `local`: la memoria di cosa si è dato a chi non ha
 * motivo di essere scritta sul disco, e alla riapertura del browser l'elenco
 * vero è comunque quello sul server.
 */
const SESSION_ALIAS_KEY = 'sessionAliases'

function undoStore() {
  return api.storage.session ?? api.storage.local
}

async function rememberUndoable(id) {
  const { [UNDOABLE_KEY]: entries = {} } = await undoStore().get({ [UNDOABLE_KEY]: {} })
  const now = Date.now()
  const kept = Object.fromEntries(
    Object.entries(entries).filter(([, at]) => now - at < UNDO_WINDOW_MS)
  )
  kept[id] = now
  await undoStore().set({ [UNDOABLE_KEY]: kept })
}

async function isUndoable(id) {
  const { [UNDOABLE_KEY]: entries = {} } = await undoStore().get({ [UNDOABLE_KEY]: {} })
  const at = entries[id]
  return typeof at === 'number' && Date.now() - at < UNDO_WINDOW_MS
}

async function sessionAliases() {
  const { [SESSION_ALIAS_KEY]: entries = {} } = await undoStore().get({ [SESSION_ALIAS_KEY]: {} })
  return entries
}

async function rememberSessionAlias(site, alias) {
  if (!site) return
  const entries = await sessionAliases()
  entries[site] = alias
  await undoStore().set({ [SESSION_ALIAS_KEY]: entries })
}

/** Toglie un alias dalla memoria di sessione, ovunque sia. Usato da "Undo". */
async function forgetSessionAlias(id) {
  const entries = await sessionAliases()
  const kept = Object.fromEntries(Object.entries(entries).filter(([, a]) => a.id !== id))
  await undoStore().set({ [SESSION_ALIAS_KEY]: kept })
}

/** Costruisce il client leggendo token e impostazioni al momento dell'uso. */
async function client() {
  return new SkudoApi({ token: await getToken() })
}

/**
 * Il nome del sito, per la descrizione dell'alias.
 *
 * Si tiene il dominio registrabile senza `www`, che è quello che l'utente
 * riconosce. Niente libreria delle suffix pubbliche: addy.io ne carica una
 * (`psl`, circa 100KB) per fare essenzialmente questo. Per una descrizione
 * leggibile e per una ricerca non serve la precisione sui domini a due livelli
 * tipo `co.uk`: al massimo la descrizione dice `example.co.uk` invece di
 * `example`, che è comunque giusta.
 */
function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Crea un alias e restituisce l'indirizzo.
 *
 * Se in questa sessione a questo sito ne è già stato dato uno, torna quello:
 * vedi SESSION_ALIAS_KEY. `fresh` è l'unico modo per averne un altro, e arriva
 * solo da un bottone che l'utente ha premuto apposta.
 *
 * @param {{site?: string, fresh?: boolean}} options
 */
async function createAlias({ site = '', fresh = false } = {}) {
  if (!fresh && site) {
    const existing = (await sessionAliases())[site]
    if (existing) return { ...existing, reused: true }
  }

  const settings = await getSettings()
  const skudo = await client()

  const alias = await skudo.createAlias({
    domain: settings.domain,
    format: settings.format,
    description: settings.describeWithSite && site ? site : '',
  })

  const created = { id: alias.id, email: aliasEmail(alias), description: alias.description || '' }

  await rememberUndoable(created.id)
  await rememberSessionAlias(site, created)

  return { ...created, reused: false }
}

/** La forma con cui un alias esce da qui. Mai più campi di quelli che servono. */
function describeAlias(alias) {
  return {
    id: alias.id,
    email: aliasEmail(alias),
    description: alias.description || '',
    active: alias.active !== false,
    createdAt: alias.created_at || '',
  }
}

/** Gli alias che l'utente ha già per un sito, per proporre il riuso. */
async function aliasesForSite(site) {
  if (!site) return []
  const skudo = await client()
  const aliases = await skudo.findAliasesForSite(site)
  return aliases
    .filter((alias) => alias.active)
    .map((alias) => ({
      id: alias.id,
      email: aliasEmail(alias),
      description: alias.description || '',
    }))
}

/* ------------------------------------------------------------------ *
 * Messaggi
 * ------------------------------------------------------------------ */

/**
 * Il messaggio viene da una pagina web o da codice nostro?
 *
 * `sender.tab` c'è solo quando il mittente è un content script, cioè codice che
 * gira dentro la pagina di un sito qualunque insieme al suo JavaScript. Il
 * popup e la pagina di collegamento non hanno scheda: sono documenti
 * dell'estensione, e nessun sito può farsi passare per loro.
 *
 * È la distinzione su cui si regge tutto il resto di questo file: i verbi che
 * toccano alias che l'utente ha già valgono solo per il primo caso.
 */
function fromOurOwnUi(sender) {
  return !sender?.tab
}

/**
 * Il content script gira dentro la pagina di un sito qualunque, quindi tutto
 * quello che arriva da lì è dato non fidato. Nessun messaggio può leggere il
 * token, scegliere l'istanza a cui parlare o passare un percorso arbitrario:
 * i verbi sono questi e basta, e i parametri sono controllati.
 */
const handlers = {
  async CREATE_ALIAS({ site, fresh }) {
    return createAlias({
      site: typeof site === 'string' ? site.slice(0, 253) : '',
      fresh: fresh === true,
    })
  },

  async ALIASES_FOR_SITE({ site }) {
    return aliasesForSite(typeof site === 'string' ? site.slice(0, 253) : '')
  },

  /**
   * Apre la pagina di collegamento.
   *
   * Serve al content script: quando si clicca l'icona senza account
   * collegato, il pannello offre di collegarlo, e il clic deve portare da
   * qualche parte invece di fallire in silenzio.
   */
  async OPEN_CONNECT() {
    await api.tabs.create({ url: api.runtime.getURL('connect.html') })
    return { opened: true }
  },

  async GET_STATE() {
    const settings = await getSettings()
    const token = await getToken()
    // Le impostazioni sì, il token mai: al popup serve sapere *se* c'è.
    return { ...settings, signedIn: token.length > 0 }
  },

  /* I verbi che seguono servono solo al popup, che è codice nostro. Un content
     script non può raggiungerli in modo utile: `SIGN_IN` verificherebbe una
     chiave che il sito dovrebbe già possedere, e gli altri richiedono un id di
     alias che non ha modo di conoscere. */

  /**
   * Apre una richiesta di collegamento.
   *
   * Il segreto resta nel contesto di sfondo: alla pagina che guida il flusso
   * torna solo l'indirizzo da aprire. Anche se quella pagina è nostra, un
   * segreto che non le passa non può finire in un registro, in uno screenshot
   * o nella cronologia.
   */
  async PAIR_START({ label }) {
    let response
    try {
      response = await fetch(`${INSTANCE}/api/v1/extension/pair`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
        credentials: 'omit',
      })
    } catch {
      throw new Error('Could not reach Skudo. Check your connection and try again.')
    }

    // Un 404 qui non è un guasto di rete: è un server che non ha ancora
    // questa funzione. Dirlo cambia cosa fa l'utente dopo, e il messaggio
    // generico lo mandava a controllare la connessione per niente.
    if (response.status === 404) {
      throw new Error('This Skudo server does not support one-click connect yet.')
    }
    if (response.status === 429) {
      throw new Error('Too many attempts. Wait a minute and try again.')
    }
    if (!response.ok) {
      throw new Error('Skudo could not start the connection. Try again shortly.')
    }

    const data = await response.json()
    await rememberSecret(api, data.secret)

    return {
      connectUrl: data.connect_url,
      interval: data.interval,
      expiresIn: data.expires_in,
    }
  },

  /**
   * Chiede se nel frattempo qualcuno ha approvato, e in caso ritira il token.
   */
  async PAIR_CLAIM() {
    const secret = await readSecret(api)
    if (!secret) return { status: 'expired' }

    const response = await fetch(`${INSTANCE}/api/v1/extension/pair/claim`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret }),
      credentials: 'omit',
    })

    if (response.status === 202) return { status: 'pending' }

    if (!response.ok) {
      // 410 scaduta, 404 sconosciuta: in entrambi i casi non c'è niente da
      // aspettare, e il segreto non serve più a nessuno.
      await forgetSecret(api)
      return { status: 'expired' }
    }

    const data = await response.json()
    await setToken(data.token)
    await forgetSecret(api)

    return { status: 'connected', username: data.username }
  },

  async PAIR_CANCEL() {
    await forgetSecret(api)
    return { cancelled: true }
  },

  async SIGN_OUT() {
    // Prima il server, poi il disco. Se la revoca non riesce (rete assente,
    // token già scaduto) si esce lo stesso: lasciare l'utente dentro perché la
    // rete non risponde sarebbe peggio che avere un token orfano, e quel token
    // scade comunque da solo.
    try {
      await (await client()).revokeSelf()
    } catch {
      /* si esce comunque */
    }

    await clearToken()
    await forgetSecret(api)
    await undoStore().remove([SESSION_ALIAS_KEY, UNDOABLE_KEY])
    // Con l'accesso va via anche l'icona nelle pagine: lasciarla attiva
    // significherebbe continuare a leggere ogni pagina per un'estensione che
    // non può più fare niente.
    await setSettings({ injectIcon: false })
    return { signedIn: false }
  },

  async SET_SETTINGS({ patch }) {
    return setSettings(patch)
  },

  /**
   * Gli alias più recenti, per il popup aperto senza un sito davanti.
   *
   * Solo dal popup. Un content script che potesse chiedere questo elenco
   * darebbe a qualunque sito, tramite un difetto nostro, un pezzo della mappa
   * dei servizi a cui l'utente è iscritto.
   */
  async RECENT_ALIASES(_message, sender) {
    if (!fromOurOwnUi(sender)) throw new ApiError('Not available here.', { code: 'FORBIDDEN' })
    const skudo = await client()
    const aliases = await skudo.recentAliases()
    return aliases.map(describeAlias)
  },

  /** Ricerca fra i propri alias. Anche questa solo dal popup. */
  async SEARCH_ALIASES({ query }, sender) {
    if (!fromOurOwnUi(sender)) throw new ApiError('Not available here.', { code: 'FORBIDDEN' })
    const term = typeof query === 'string' ? query.trim().slice(0, 100) : ''
    if (!term) return handlers.RECENT_ALIASES({}, sender)
    const skudo = await client()
    const aliases = await skudo.findAliasesForSite(term)
    return aliases.map(describeAlias)
  },

  async SET_ALIAS_ACTIVE({ id, active }, sender) {
    if (!fromOurOwnUi(sender)) throw new ApiError('Not available here.', { code: 'FORBIDDEN' })
    const skudo = await client()
    await skudo.setAliasActive(id, active === true)
    return { id, active: active === true }
  },

  async DOMAIN_OPTIONS() {
    const skudo = await client()
    return skudo.getDomainOptions()
  },

  async UPDATE_ALIAS({ id, description }, sender) {
    if (!fromOurOwnUi(sender) && !(await isUndoable(id))) {
      throw new ApiError('That alias cannot be changed from here.', { code: 'FORBIDDEN' })
    }
    const skudo = await client()
    await skudo.updateAlias(id, { description })
    return { id }
  },

  async DELETE_ALIAS({ id }, sender) {
    // Dal popup si cancella qualunque alias: è la nostra interfaccia, e
    // l'utente ha l'elenco davanti. Da una pagina vale solo quello appena
    // creato, e solo per pochi minuti: vedi UNDOABLE_KEY.
    if (!fromOurOwnUi(sender) && !(await isUndoable(id))) {
      throw new ApiError('That alias can no longer be undone from here.', { code: 'FORBIDDEN' })
    }
    const skudo = await client()
    await skudo.deleteAlias(id)
    // Disfatto vuol dire anche dimenticato: se restasse in memoria di
    // sessione, il clic successivo su quel sito ripescherebbe un alias che
    // sul server non esiste più.
    await forgetSessionAlias(id)
    return { id }
  },
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message?.type]
  if (!handler) return false

  // Un messaggio senza scheda mittente non viene da una pagina: viene dal
  // popup, che è nostro.
  handler(message, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) =>
      sendResponse({ ok: false, error: error.message, code: error.code || 'ERROR' })
    )

  // true: la risposta arriva dopo, il canale resta aperto.
  return true
})

/* ------------------------------------------------------------------ *
 * Menu contestuale e scorciatoia
 * ------------------------------------------------------------------ */

async function copyToPage(tabId, text) {
  // Il contesto di sfondo non ha appunti: su Chromium è un service worker senza
  // documento, e `navigator.clipboard` richiede un contesto con focus. Si passa
  // dalla pagina, che ce l'ha.
  await api.scripting.executeScript({
    target: { tabId },
    args: [text],
    func: (value) => navigator.clipboard.writeText(value),
  })
}

async function createAndCopy(tab) {
  if (!tab?.id) return
  try {
    const { email } = await createAlias({ site: siteName(tab.url) })
    await copyToPage(tab.id, email)
    await api.action.setBadgeText({ tabId: tab.id, text: '✓' })
  } catch {
    await api.action.setBadgeText({ tabId: tab.id, text: '!' })
  }
  setTimeout(() => api.action.setBadgeText({ tabId: tab.id, text: '' }), 4000)
}

api.commands?.onCommand.addListener((command, tab) => {
  if (command === 'create_alias') createAndCopy(tab)
})

api.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID) createAndCopy(tab)
})

/* ------------------------------------------------------------------ *
 * Registrazione del content script
 * ------------------------------------------------------------------ */

/**
 * Il content script non è dichiarato nel manifest.
 *
 * addy.io e SimpleLogin lo dichiarano su `<all_urls>`: l'estensione ha accesso a
 * ogni pagina dal momento dell'installazione, prima ancora che l'utente abbia
 * fatto l'accesso. Qui viene registrato solo quando l'utente accende l'icona nei
 * campi, e solo dopo che ha concesso il permesso.
 */
async function syncContentScript() {
  const { injectIcon } = await getSettings()
  const granted = await api.permissions.contains({ origins: ['<all_urls>'] })

  const existing = await api.scripting
    .getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] })
    .catch(() => [])

  if (!injectIcon || !granted) {
    if (existing.length) await api.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] })
    return
  }

  if (existing.length) return

  await api.scripting.registerContentScripts([
    {
      id: CONTENT_SCRIPT_ID,
      js: ['content.js'],
      matches: ['<all_urls>'],
      runAt: 'document_idle',
      allFrames: true,
    },
  ])
}

async function syncContextMenu() {
  const { contextMenu } = await getSettings()
  await api.contextMenus.removeAll()
  if (!contextMenu) return
  api.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Create a Skudo alias and copy it',
    contexts: ['editable'],
  })
}

async function sync() {
  await Promise.all([syncContentScript(), syncContextMenu()])
}

api.runtime.onInstalled.addListener(sync)
api.runtime.onStartup.addListener(sync)
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('injectIcon' in changes || 'contextMenu' in changes)) sync()
})
api.permissions.onAdded.addListener(sync)
api.permissions.onRemoved.addListener(sync)
