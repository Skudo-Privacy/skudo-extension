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
import * as cooldown from './shared/cooldown.js'
import { registrableDomain, siteFromUrl } from './shared/domain.js'
import { relatedSites } from './shared/related-sites.js'
import { forgetIcons, pendingIcons, resolveIcons } from './shared/icons.js'
import { parseServerTime } from './shared/time.js'
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

/**
 * Il ritmo di creazione, tenuto qui e non nella finestra che lo mostra.
 *
 * Il popup si chiude appena si guarda un'altra scheda, e il pannello dentro le
 * pagine muore quando la pagina cambia. Se il conteggio vivesse li', chiudere e
 * riaprire azzererebbe il freno, cioe' lo toglierebbe proprio a chi sta
 * premendo piu' volte.
 *
 * `storage.session` e non `local`: e' uno stato di questo avvio del browser,
 * non qualcosa da scrivere sul disco.
 */
const COOLDOWN_KEY = 'createCooldown'

async function cooldownState() {
  const { [COOLDOWN_KEY]: state = cooldown.EMPTY } = await undoStore().get({
    [COOLDOWN_KEY]: cooldown.EMPTY,
  })
  return state
}

async function noteCreation() {
  const next = cooldown.afterCreate(await cooldownState(), Date.now())
  await undoStore().set({ [COOLDOWN_KEY]: next })
  return next
}

/** Costruisce il client leggendo token e impostazioni al momento dell'uso. */
async function client() {
  return new SkudoApi({ token: await getToken() })
}

/**
 * Il nome del sito, per la descrizione dell'alias.
 *
 * Si tiene l'host senza `www`, che è quello che l'utente riconosce. Il dominio
 * registrabile, che è un'altra cosa e serve al legame tecnico, lo calcola
 * src/shared/domain.js.
 */
function siteName(url) {
  return siteFromUrl(url).host
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

  // Il freno. Sta prima della chiamata e non dentro l'interfaccia perche' i
  // punti da cui si crea un alias sono quattro (il popup, il pannello nelle
  // pagine, il menu contestuale, la scorciatoia da tastiera) e ognuno di loro
  // avrebbe dimenticato di controllarlo almeno una volta.
  //
  // Un alias riusato non passa di qui: non e' una creazione.
  const waiting = cooldown.remaining(await cooldownState(), Date.now())

  if (waiting > 0) {
    throw new ApiError(cooldown.describe(await cooldownState(), Date.now()), {
      code: 'COOLDOWN',
      retryAfter: waiting,
    })
  }

  const settings = await getSettings()
  const skudo = await client()

  // Il legame tecnico con il sito, se l'utente lo vuole. `site` arriva come
  // host completo; la radice serve al server per riconoscere che
  // `accounts.esempio.com` e `esempio.com` sono lo stesso posto.
  const root = settings.associateSite ? registrableDomain(site) : ''

  const startedAt = Date.now()
  const body = {
    domain: settings.domain,
    format: settings.format,
    description: settings.describeWithSite && site ? site : '',
    site: root ? site : '',
    siteRoot: root,
  }

  let alias
  try {
    try {
      alias = await skudo.createAlias(body)
    } catch (error) {
      // L'associazione al sito e' un di piu': se il server non la accetta
      // (un host che non e' un dominio, una radice che non riconosce) l'alias
      // si crea lo stesso, senza. Rinunciare a tutto per un'icona sarebbe il
      // difetto peggiore possibile.
      if (error.code !== 'INVALID' || !['site', 'site_root'].includes(error.field)) throw error
      alias = await skudo.createAlias({ ...body, site: '', siteRoot: '' })
    }
  } catch (error) {
    // Un 5xx o una risposta persa non vuol dire che l'alias non sia stato
    // creato: il server puo' aver scritto la riga e poi fallito dopo. Mostrare
    // "Server error" e far riprovare crea un doppione a ogni tentativo e
    // consuma il limite orario. Prima di arrendersi si guarda se c'e'.
    const uncertain = error.code === 'NETWORK' || error.code === 'TIMEOUT' || error.status >= 500
    alias = uncertain ? await findJustCreated(skudo, startedAt) : null
    if (!alias) throw error
  }

  const created = {
    id: alias.id,
    email: aliasEmail(alias),
    description: alias.description || '',
    site: alias.site || (root ? site : ''),
    // Senza questo il popup leggeva `undefined` come "spento" e barrava
    // l'alias appena nato.
    active: alias.active !== false,
    createdAt: alias.created_at || new Date().toISOString(),
  }

  await noteCreation()
  await rememberUndoable(created.id)
  await rememberSessionAlias(site, created)

  return { ...created, reused: false }
}

/**
 * L'alias creato in questo istante, se il server l'ha creato ma non l'ha detto.
 *
 * Si riprova un paio di volte: dopo un 5xx la riga puo' non essere ancora
 * visibile alla prima lettura. L'orario va letto come UTC (vedi
 * src/shared/time.js) e la finestra di un minuto assorbe lo scarto fra
 * l'orologio del server e il nostro.
 */
async function findJustCreated(skudo, startedAt) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 700))
    try {
      const recent = await skudo.recentAliases()
      const found = recent.find((entry) => parseServerTime(entry.created_at) >= startedAt - 60000)
      if (found) return found
    } catch {
      /* si riprova */
    }
  }
  return null
}

/** La forma con cui un alias esce da qui. Mai più campi di quelli che servono. */
function describeAlias(alias) {
  return {
    id: alias.id,
    email: aliasEmail(alias),
    description: alias.description || '',
    // Il sito serve a due cose sole: mostrarne l'icona e dire a chi guarda
    // l'elenco dove ha usato quell'indirizzo.
    site: alias.site || '',
    active: alias.active !== false,
    createdAt: alias.created_at || '',
  }
}

/** Gli alias che l'utente ha già per un sito, per proporre il riuso. */
/**
 * Il gruppo di domini che contano come "questo sito".
 *
 * Il dominio registrabile, piu' gli altri domini che condividono lo stesso
 * account secondo i dati di apple/password-manager-resources: safeway.com e
 * vons.com sono un login solo, e senza il gruppo il popup aperto su vons.com
 * non trova niente e fa creare un secondo alias per lo stesso account.
 *
 * Si manda la radice, non il nome dell'host: gli alias sono registrati sul
 * dominio registrabile, quindi chiedere `shop.example.com` non trovava
 * l'alias registrato su `example.com`. Era un difetto anche prima del gruppo.
 */
function siteGroup(site) {
  const root = registrableDomain(site)
  if (!root) return []

  // Sessanta e' il tetto che accetta il server (App\Rules\ValidSiteDomainList):
  // il gruppo piu' lungo dei dati di partenza ne ha 53.
  return [root, ...relatedSites(root)].slice(0, 60)
}

/**
 * Gli alias che l'utente ha gia' per un sito.
 *
 * `onlyActive` distingue i due usi. Il pannello dentro la pagina propone di
 * riusare un alias, e proporre un alias spento vorrebbe dire consigliare un
 * indirizzo che non consegna niente. Il popup invece e' l'elenco: nascondere
 * la' un alias spento significa dire "nessun alias per questo sito" a chi ne
 * ha uno e l'ha solo messo in pausa.
 */
async function aliasesForSite(site, { onlyActive = true } = {}) {
  const group = siteGroup(site)
  if (group.length === 0) return []

  const skudo = await client()
  const aliases = await skudo.findAliasesForSite(group)
  const rows = aliases.map(describeAlias)

  return onlyActive ? rows.filter((alias) => alias.active) : rows
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

  async ALIASES_FOR_SITE({ site, includeInactive = false }, sender) {
    // Solo la nostra interfaccia puo' chiedere anche gli alias spenti: da una
    // pagina qualunque l'elenco resta quello che si puo' proporre di riusare.
    return aliasesForSite(typeof site === 'string' ? site.slice(0, 253) : '', {
      onlyActive: !(includeInactive && fromOurOwnUi(sender)),
    })
  },

  /**
   * Quanto manca prima di poter creare un altro alias.
   *
   * Lo chiedono il popup all'apertura e il pannello quando compare, perche' il
   * conteggio vive qui: vedi COOLDOWN_KEY. Restituisce anche le soglie, cosi'
   * chi disegna non le ricopia.
   */
  async COOLDOWN_STATE() {
    const state = await cooldownState()
    const now = Date.now()

    return {
      remaining: cooldown.remaining(state, now),
      label: cooldown.describe(state, now),
    }
  },

  /**
   * Le icone dei siti, come `data:`.
   *
   * Solo dalle nostre pagine. Un content script che potesse chiederle
   * scoprirebbe, dalla differenza fra una risposta immediata e una lenta, quali
   * icone sono gia' nella cache: cioe' dove l'utente ha degli alias. E' un
   * canale stretto e indiretto, e non c'e' motivo di lasciarlo aperto, perche'
   * il pannello dentro le pagine le icone non le disegna.
   */
  async SITE_ICONS({ sites, retry = false }, sender) {
    if (!fromOurOwnUi(sender)) throw new ApiError('Not available here.', { code: 'FORBIDDEN' })

    const { siteIcons } = await getSettings()
    if (!siteIcons) return {}

    const wanted = (Array.isArray(sites) ? sites : []).filter((site) => typeof site === 'string')

    const icons = await resolveIcons(wanted, { retry: retry === true })
    // Chi disegna deve sapere se c'e' qualcosa che arrivera' fra poco, per
    // programmare un secondo giro invece di restare sulle lettere.
    return { icons, pending: await pendingIcons(wanted) }
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

  /** Svuota le icone tenute sul disco. Solo dal popup. */
  async CLEAR_ICONS(_message, sender) {
    if (!fromOurOwnUi(sender)) throw new ApiError('Not available here.', { code: 'FORBIDDEN' })
    await forgetIcons()
    return { cleared: true }
  },

  /** Apre l'app Skudo in una scheda. Solo dal popup. */
  async OPEN_APP(_message, sender) {
    if (!fromOurOwnUi(sender)) throw new ApiError('Not available here.', { code: 'FORBIDDEN' })
    await api.tabs.create({ url: INSTANCE })
    return { opened: true }
  },

  async GET_STATE() {
    const settings = await getSettings()
    const token = await getToken()
    // Le impostazioni sì, il token mai: al popup serve sapere *se* c'è.
    return { ...settings, signedIn: token.length > 0 }
  },

  /**
   * Zittisce l'estensione su un sito.
   *
   * Arriva dal content script, quindi da una pagina qualunque, e per questo il
   * dominio non viene creduto: si usa quello della scheda che ha mandato il
   * messaggio. Un sito che potesse scrivere questa lista da solo potrebbe
   * spegnere l'estensione altrove, che e' esattamente quello che vorrebbe fare
   * un sito a cui l'estensione da' fastidio.
   */
  async PAUSE_SITE(_message, sender) {
    const url = sender?.tab?.url || sender?.url || ''
    let host = ''
    try {
      host = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      throw new ApiError('That site could not be identified.', { code: 'INVALID' })
    }
    if (!host) throw new ApiError('That site could not be identified.', { code: 'INVALID' })

    const { pausedSites = [] } = await getSettings()
    if (!pausedSites.includes(host)) {
      await setSettings({ pausedSites: [...pausedSites, host] })
    }
    return { paused: host }
  },

  async RESUME_SITE({ site }, sender) {
    if (!fromOurOwnUi(sender)) throw new ApiError('Not available here.', { code: 'FORBIDDEN' })
    const { pausedSites = [] } = await getSettings()
    await setSettings({ pausedSites: pausedSites.filter((entry) => entry !== site) })
    return { resumed: site }
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
    await undoStore().remove([SESSION_ALIAS_KEY, UNDOABLE_KEY, COOLDOWN_KEY])
    // Le icone se ne vanno con l'account: sono l'elenco dei posti dove
    // quell'account aveva degli alias, e restare sul disco dopo un'uscita e'
    // esattamente quello che una persona non si aspetta.
    await forgetIcons()
    // Con l'accesso va via anche l'icona nelle pagine: lasciarla attiva
    // significherebbe continuare a leggere ogni pagina per un'estensione che
    // non può più fare niente.
    await setSettings({ injectIcon: false })
    // Il permesso va via con lui, altrimenti `alignIconSetting` lo
    // rileggerebbe e riaccenderebbe l'icona per un'estensione scollegata.
    await api.permissions.remove({ origins: ['<all_urls>'] }).catch(() => {})
    return { signedIn: false }
  },

  async SET_SETTINGS({ patch }, sender) {
    // Solo dalle nostre pagine. Un content script che potesse scrivere qui
    // cambierebbe il dominio su cui si creano gli alias, o si toglierebbe
    // dall'elenco dei siti messi in pausa: due cose che un sito vorrebbe fare
    // e che non deve poter fare.
    if (!fromOurOwnUi(sender)) throw new ApiError('Not available here.', { code: 'FORBIDDEN' })
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

  /**
   * Ricerca fra i propri alias. Anche questa solo dal popup.
   *
   * Il server cerca nell'indirizzo e nella nota, mai nel sito (che vive in un
   * indice cieco). Chi scrive `amazon.it` cerca un sito, non un testo: se il
   * termine ha la forma di un dominio si interroga anche l'indice del sito e
   * si uniscono i due risultati, quello per sito per primo.
   */
  async SEARCH_ALIASES({ query }, sender) {
    if (!fromOurOwnUi(sender)) throw new ApiError('Not available here.', { code: 'FORBIDDEN' })
    const term = typeof query === 'string' ? query.trim().slice(0, 100) : ''
    if (!term) return handlers.RECENT_ALIASES({}, sender)
    const skudo = await client()

    const host = term.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/[/?#].*$/, '').replace(/^www\./i, '')
    const group = /^[^\s@]+\.[^\s@.]{2,}$/.test(host) ? siteGroup(host) : []

    const [bySite, byText] = await Promise.all([
      group.length ? skudo.findAliasesForSite(group).catch(() => []) : [],
      skudo.searchAliases(term),
    ])

    const seen = new Set()
    return [...bySite, ...byText]
      .filter((alias) => !seen.has(alias.id) && seen.add(alias.id))
      .map(describeAlias)
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

  async UPDATE_ALIAS({ id, description, site = '', siteRoot = '' }, sender) {
    if (!fromOurOwnUi(sender) && !(await isUndoable(id))) {
      throw new ApiError('That alias cannot be changed from here.', { code: 'FORBIDDEN' })
    }
    // L'associazione a un sito la scrive solo la nostra interfaccia. Da una
    // pagina qualunque si puo' al massimo correggere la nota dell'alias
    // appena creato (vedi UNDOABLE_KEY): se passasse anche il sito, un
    // frammento di script su una pagina potrebbe attribuire a se' un alias
    // nato altrove, e da quel momento l'elenco mostrerebbe il sito
    // sbagliato accanto a quell'indirizzo.
    const ours = fromOurOwnUi(sender)
    const skudo = await client()
    await skudo.updateAlias(id, {
      description,
      site: ours ? site : '',
      siteRoot: ours ? siteRoot : '',
    })
    return { id, site: ours ? site : '' }
  },

  /**
   * "Turn it on", dal lato dello sfondo.
   *
   * La pagina ha gia' ottenuto il permesso dal browser; qui si registra lo
   * script e lo si mette nelle schede aperte, senza aspettare l'evento
   * `permissions.onAdded`, che su alcuni motori arriva tardi o non arriva.
   */
  async ENABLE_FIELD_ICON(_message, sender) {
    if (!fromOurOwnUi(sender)) throw new ApiError('Not available here.', { code: 'FORBIDDEN' })
    if (!(await hasPagePermission())) return { enabled: false }
    await sync()
    await injectIntoOpenTabs()
    return { enabled: true }
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
      sendResponse({
        ok: false,
        error: error.message,
        code: error.code || 'ERROR',
        // Quando c'e' un'attesa, quanto manca. Chi ha chiesto disegna un
        // bottone che si riapre da solo invece di un errore.
        retryAfter: error.retryAfter || 0,
      })
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
async function hasPagePermission() {
  try {
    return await api.permissions.contains({ origins: ['<all_urls>'] })
  } catch {
    return false
  }
}

/**
 * Il permesso e' la fonte di verita', l'impostazione ne e' lo specchio.
 *
 * Prima l'icona si accendeva solo se *due* cose erano vere insieme: il
 * permesso concesso e `injectIcon` salvato. Salvarlo era un messaggio
 * separato, spedito dalla pagina di collegamento o dal popup dopo la
 * risposta del browser, e quel messaggio si perdeva spesso: su Chromium il
 * popup si chiude appena compare la richiesta, su Gecko lo sfondo puo'
 * ripartire proprio in quel momento. Risultato: permesso dato, "Turn it on"
 * premuto, e nessuna icona.
 *
 * Qui chi concede il permesso ha acceso l'icona, punto. Non esiste un modo di
 * avere il permesso e non volere l'icona: spegnere l'interruttore toglie il
 * permesso. Quindi a ogni avvio e a ogni cambio di permesso le due cose si
 * riallineano da sole, senza dipendere dal messaggio giusto al momento giusto.
 */
async function alignIconSetting(granted) {
  const { injectIcon } = await getSettings()
  if (injectIcon !== granted) await setSettings({ injectIcon: granted })
}

async function syncContentScript() {
  const granted = await hasPagePermission()
  await alignIconSetting(granted)

  const existing = await api.scripting
    .getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] })
    .catch(() => [])

  if (!granted) {
    if (existing.length) await api.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] })
    return
  }

  if (!existing.length) {
    await api.scripting.registerContentScripts([
      {
        id: CONTENT_SCRIPT_ID,
        js: ['content.js'],
        matches: ['<all_urls>'],
        runAt: 'document_idle',
        allFrames: true,
        // Gecko: sopravvive al riavvio del browser. Chromium lo fa sempre.
        persistAcrossSessions: true,
      },
    ])
  }
}

/**
 * Mette l'icona anche nelle schede gia' aperte.
 *
 * Un content script registrato parte solo sulle pagine che si caricano da
 * adesso in poi. Chi preme "Turn it on" ha davanti le schede che aveva aperte,
 * e se nessuna ha l'icona la prima impressione e' che non abbia funzionato. Su
 * mobile pesa di piu': li' le schede restano aperte per giorni.
 *
 * `content.js` si protegge da solo dalla doppia esecuzione, quindi una scheda
 * dove lo script e' gia' arrivato non ne paga niente.
 */
async function injectIntoOpenTabs() {
  if (!api.scripting?.executeScript || !api.tabs?.query) return
  let tabs = []
  try {
    tabs = await api.tabs.query({ url: ['http://*/*', 'https://*/*'] })
  } catch {
    return
  }
  await Promise.allSettled(
    tabs.map((tab) =>
      api.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.js'],
      })
    )
  )
}

async function syncContextMenu() {
  // Firefox per Android non ha il menu contestuale: li' non c'e' niente da
  // registrare, e chiamare `removeAll` su un oggetto che non esiste farebbe
  // fallire tutta la sincronizzazione.
  if (!api.contextMenus?.removeAll) return
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
  await Promise.allSettled([syncContentScript(), syncContextMenu()])
}

api.runtime.onInstalled.addListener(sync)
api.runtime.onStartup.addListener(sync)
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('injectIcon' in changes || 'contextMenu' in changes)) sync()
})
api.permissions.onAdded.addListener(async () => {
  await sync()
  if (await hasPagePermission()) await injectIntoOpenTabs()
})
api.permissions.onRemoved.addListener(sync)

// A ogni risveglio, oltre che a installazione e avvio: costa una lettura, e
// ripara da solo uno script registrato che il browser si e' dimenticato.
sync().catch(() => {})

