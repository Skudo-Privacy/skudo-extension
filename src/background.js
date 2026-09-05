/**
 * Contesto di sfondo: l'unico posto in cui il token esiste.
 *
 * Gira come service worker su Chromium e come event page su Gecko, dallo stesso
 * file (vedi docs/BROWSERS.md). Entrambi vengono spenti quando sono inattivi,
 * quindi qui non c'è stato in memoria che si presuma vivo: tutto quello che
 * deve sopravvivere sta in `storage`.
 */

import { SkudoApi, aliasEmail } from './shared/api.js'
import { api } from './shared/browser.js'
import { clearToken, getSettings, getToken, setSettings, setToken } from './shared/storage.js'

const CONTEXT_MENU_ID = 'skudo-create-alias'
const CONTENT_SCRIPT_ID = 'skudo-field-icon'

/** Costruisce il client leggendo token e impostazioni al momento dell'uso. */
async function client() {
  const [{ instance }, token] = await Promise.all([getSettings(), getToken()])
  return new SkudoApi({ instance, token })
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
 * @param {{site?: string}} options
 */
async function createAlias({ site = '' } = {}) {
  const settings = await getSettings()
  const skudo = await client()

  const alias = await skudo.createAlias({
    domain: settings.domain,
    format: settings.format,
    description: settings.describeWithSite && site ? site : '',
  })

  return { id: alias.id, email: aliasEmail(alias), description: alias.description || '' }
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
 * Il content script gira dentro la pagina di un sito qualunque, quindi tutto
 * quello che arriva da lì è dato non fidato. Nessun messaggio può leggere il
 * token, scegliere l'istanza a cui parlare o passare un percorso arbitrario:
 * i verbi sono questi e basta, e i parametri sono controllati.
 */
const handlers = {
  async CREATE_ALIAS({ site }) {
    return createAlias({ site: typeof site === 'string' ? site.slice(0, 253) : '' })
  },

  async ALIASES_FOR_SITE({ site }) {
    return aliasesForSite(typeof site === 'string' ? site.slice(0, 253) : '')
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

  async SIGN_IN({ instance, token }) {
    const skudo = new SkudoApi({ instance, token })
    // Si verifica prima di salvare: una chiave sbagliata deve dare un errore
    // adesso, non fra tre giorni davanti a un modulo di iscrizione.
    await skudo.verifyToken()
    await setSettings({ instance })
    await setToken(token)
    return { signedIn: true }
  },

  async SIGN_OUT() {
    await clearToken()
    // Con l'accesso va via anche l'icona nelle pagine: lasciarla attiva
    // significherebbe continuare a leggere ogni pagina per un'estensione che
    // non può più fare niente.
    await setSettings({ injectIcon: false })
    return { signedIn: false }
  },

  async SET_SETTINGS({ patch }) {
    return setSettings(patch)
  },

  async DOMAIN_OPTIONS() {
    const skudo = await client()
    return skudo.getDomainOptions()
  },

  async UPDATE_ALIAS({ id, description }) {
    const skudo = await client()
    await skudo.updateAlias(id, { description })
    return { id }
  },

  async DELETE_ALIAS({ id }) {
    const skudo = await client()
    await skudo.deleteAlias(id)
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
