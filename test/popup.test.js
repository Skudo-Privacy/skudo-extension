import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

/**
 * Il popup, eseguito davvero.
 *
 * Il resto delle prove legge il codice; queste lo fanno girare. Serve perché
 * l'elenco costruisce nodi a mano, e un id sbagliato o una funzione chiamata
 * prima di esistere non si vedono né dalla costruzione né dalla lettura: si
 * vedono solo aprendo il popup, cioè quando è già in mano a qualcuno.
 *
 * `chrome` è finto e risponde ai messaggi: il popup non parla con la rete, e
 * quindi non serve niente di più di così.
 */
function loadPopupMarkup() {
  const html = readFileSync(join(src, 'popup.html'), 'utf8')
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  // Via il <script>: qui il modulo lo importiamo noi, e lasciarlo nel markup
  // fa solo lamentare il DOM finto, che non carica file.
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '')
}

const ALIASES = [
  { id: 'a1', email: 'quiet.pine8x@skudo.me', description: 'example.com', site: 'example.com', active: true },
  { id: 'a2', email: 'lone.harbour2k@skudo.me', description: '', site: '', active: false },
]

/** Un PNG di un pixel, per non inventare byte. */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function fakeChrome(overrides = {}) {
  const handlers = {
    GET_STATE: () => ({
      domain: 'skudo.me',
      format: 'random_characters',
      injectIcon: false,
      contextMenu: true,
      describeWithSite: true,
      associateSite: true,
      siteIcons: true,
      theme: 'auto',
      signedIn: true,
    }),
    RECENT_ALIASES: () => ALIASES,
    SEARCH_ALIASES: () => [ALIASES[0]],
    ALIASES_FOR_SITE: () => [ALIASES[0]],
    DOMAIN_OPTIONS: () => ['skudo.me'],
    SET_ALIAS_ACTIVE: ({ id, active }) => ({ id, active }),
    UPDATE_ALIAS: ({ id }) => ({ id }),
    DELETE_ALIAS: ({ id }) => ({ id }),
    SITE_ICONS: () => ({ 'example.com': PIXEL }),
    COOLDOWN_STATE: () => ({ remaining: 0, label: '' }),
    SET_SETTINGS: ({ patch }) => patch,
    ...overrides,
  }

  const sent = []

  return {
    sent,
    api: {
      runtime: {
        sendMessage: vi.fn(async (message) => {
          sent.push(message)
          const handler = handlers[message.type]
          if (!handler) return { ok: false, error: `no handler for ${message.type}` }
          return { ok: true, data: handler(message) }
        }),
        getURL: (path) => `chrome-extension://skudo/${path}`,
      },
      tabs: {
        query: async () => [{ id: 1, url: overrides.tabUrl ?? 'https://example.com/signup' }],
        create: vi.fn(async () => ({ id: 2 })),
      },
      permissions: {
        contains: async () => false,
        request: async () => false,
        remove: async () => true,
      },
      storage: { local: { get: async () => ({}), set: async () => {} } },
    },
  }
}

/** Aspetta che la coda delle promesse si svuoti: il popup si popola da lì. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

async function startPopup(overrides) {
  const fake = fakeChrome(overrides)
  globalThis.chrome = fake.api
  globalThis.browser = undefined
  loadPopupMarkup()
  vi.resetModules()
  await import('../src/popup.js?' + Math.random())
  await settle()
  await settle()
  return fake
}

beforeEach(() => {
  // `navigator.clipboard` è di sola lettura in happy-dom: si definisce invece
  // di assegnare.
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  delete globalThis.chrome
})

describe('il popup', () => {
  it('con un sito davanti mostra gli alias di quel sito', async () => {
    await startPopup()

    expect(document.getElementById('site').textContent).toBe('example.com')
    expect(document.querySelectorAll('#alias-list li')).toHaveLength(1)
  })

  it('il sito parte scritto nella barra di ricerca, e si puo cancellare', async () => {
    const fake = await startPopup()

    // Il filtro si vede: e' nel campo, non nascosto nello stato del popup.
    expect(document.getElementById('search').value).toBe('example.com')
    expect(document.getElementById('search-clear').hidden).toBe(false)
    // Con quella parola esatta si cerca per relazione, non per testo.
    expect(fake.sent.some((m) => m.type === 'ALIASES_FOR_SITE')).toBe(true)
    expect(fake.sent.some((m) => m.type === 'SEARCH_ALIASES')).toBe(false)

    document.getElementById('search-clear').click()
    await settle()

    // Svuotare mostra tutti gli alias, anche quelli di altri siti.
    expect(document.getElementById('search').value).toBe('')
    expect(document.getElementById('search-clear').hidden).toBe(true)
    expect(fake.sent.some((m) => m.type === 'RECENT_ALIASES')).toBe(true)
    expect(document.querySelectorAll('#alias-list .row')).toHaveLength(2)
  })

  it('un alias di un dominio fratello dice da dove viene', async () => {
    // safeway.com e vons.com sono un login solo: l'alias nato sull'uno
    // compare sull'altro, ma senza dirlo sarebbe un indirizzo apparso dal
    // nulla.
    const sibling = { id: 'a3', email: 'calm.reef4z@skudo.me', description: 'spesa', site: 'safeway.com', active: true }
    const fake = await startPopup({
      ALIASES_FOR_SITE: () => [sibling],
      tabUrl: 'https://vons.com/account',
    })

    expect(fake.sent.find((m) => m.type === 'ALIASES_FOR_SITE').includeInactive).toBe(true)
    expect(document.querySelector('#alias-list .row__sub').textContent).toBe('Saved on safeway.com')
  })

  it('aperto su un sito senza alias dice come vedere tutti gli altri', async () => {
    await startPopup({ ALIASES_FOR_SITE: () => [] })

    const empty = document.getElementById('list-empty')
    expect(empty.hidden).toBe(false)
    expect(empty.textContent).toContain('Clear the box')
  })

  it('copiare un alias senza sito lo associa a quello che si sta guardando', async () => {
    const fake = await startPopup({ RECENT_ALIASES: () => ALIASES, ALIASES_FOR_SITE: () => [ALIASES[1]] })

    document.querySelector('#alias-list .row').click()
    await settle()
    document.querySelector('.address .icon-button').click()
    await settle()
    await settle()

    const update = fake.sent.find((m) => m.type === 'UPDATE_ALIAS')
    expect(update).toMatchObject({ id: 'a2', site: 'example.com', siteRoot: 'example.com' })
  })

  it('copiare un alias che ha gia un sito non lo sposta', async () => {
    const fake = await startPopup()

    document.querySelector('#alias-list .row').click()
    await settle()
    document.querySelector('.address .icon-button').click()
    await settle()
    await settle()

    expect(fake.sent.some((m) => m.type === 'UPDATE_ALIAS')).toBe(false)
  })

  it('senza un sito davanti mostra gli ultimi alias', async () => {
    const fake = await startPopup()
    fake.api.tabs.query = async () => [{ id: 1, url: 'about:newtab' }]

    // Si riavvia il popup con la scheda senza sito.
    document.body.innerHTML = ''
    globalThis.chrome = fake.api
    loadPopupMarkup()
    vi.resetModules()
    await import('../src/popup.js?' + Math.random())
    await settle()
    await settle()

    const rows = document.querySelectorAll('#alias-list .row')
    expect(rows).toHaveLength(2)
    // Il secondo è spento: deve vedersi.
    expect(rows[1].classList.contains('is-off')).toBe(true)
  })

  it('senza niente scelto la colonna di destra invita, non resta vuota', async () => {
    await startPopup()

    const blank = document.querySelector('#detail .blank')
    expect(blank).not.toBeNull()
    expect(blank.textContent).toContain('Pick an alias')
  })

  it('scegliere una riga apre il dettaglio con indirizzo, nota e data', async () => {
    await startPopup()

    document.querySelector('#alias-list .row').click()
    await settle()

    const detail = document.getElementById('detail')
    expect(detail.textContent).toContain('quiet.pine8x')
    expect(detail.querySelector('#detail-note').value).toBe('example.com')
    expect(detail.textContent).toContain('Enabled')
  })

  it('non nomina mai l indirizzo di inoltro', async () => {
    await startPopup()
    document.querySelector('#alias-list .row').click()
    await settle()

    // Non è una prova sul testo per pignoleria: il vincolo è che di quella
    // cosa non si parli, e una riga aggiunta per comodità mesi dopo sarebbe
    // il modo esatto in cui rientrerebbe.
    const text = document.body.textContent.toLowerCase()
    for (const word of ['recipient', 'forwards to', 'inoltro', 'real address']) {
      expect(text).not.toContain(word)
    }
  })

  it('accende e spegne un alias dal dettaglio', async () => {
    const fake = await startPopup()

    document.querySelector('#alias-list .row').click()
    await settle()

    const toggle = document.querySelector('#detail .toggle')
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    toggle.click()
    await settle()

    expect(fake.sent).toContainEqual({ type: 'SET_ALIAS_ACTIVE', id: 'a1', active: false })
    expect(document.querySelector('#alias-list .row').classList.contains('is-off')).toBe(true)
    expect(document.querySelector('#detail .toggle').getAttribute('aria-checked')).toBe('false')
  })

  it('chiede conferma prima di cancellare, e non cancella se si dice di no', async () => {
    const fake = await startPopup()

    document.querySelector('#alias-list .row').click()
    await settle()

    const buttons = () => [...document.querySelectorAll('#detail button')]
    buttons().find((b) => b.textContent === 'Delete alias').click()
    await settle()

    buttons().find((b) => b.textContent === 'Keep it').click()
    await settle()

    expect(fake.sent.some((m) => m.type === 'DELETE_ALIAS')).toBe(false)
    expect(document.querySelectorAll('#alias-list .row')).toHaveLength(1)
  })

  it('cancella quando si conferma, e la colonna di destra torna vuota', async () => {
    const fake = await startPopup()

    document.querySelector('#alias-list .row').click()
    await settle()

    const buttons = () => [...document.querySelectorAll('#detail button')]
    buttons().find((b) => b.textContent === 'Delete alias').click()
    await settle()

    buttons().find((b) => b.textContent === 'Delete for good').click()
    await settle()

    expect(fake.sent).toContainEqual({ type: 'DELETE_ALIAS', id: 'a1' })
    expect(document.querySelectorAll('#alias-list .row')).toHaveLength(0)
    expect(document.querySelector('#detail .blank')).not.toBeNull()
  })

  it('la ricerca chiede al contesto di sfondo e ridisegna', async () => {
    const fake = await startPopup()

    const search = document.getElementById('search')
    search.value = 'harbour'
    search.dispatchEvent(new Event('input'))

    // Timer veri e non finti: il popup si avvia con delle promesse che
    // aspettano `setTimeout`, e sostituire l'orologio prima dell'avvio lo
    // lascia fermo per sempre. Aspettare per davvero costa un quarto di
    // secondo e non ha modi di sbagliare.
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(fake.sent).toContainEqual({ type: 'SEARCH_ALIASES', query: 'harbour' })
    expect(document.querySelectorAll('#alias-list .row')).toHaveLength(1)
  })

  it('mette l icona del sito accanto agli alias che ne hanno uno', async () => {
    await startPopup()
    // Le icone arrivano dopo il primo disegno: si lascia sfilare la coda.
    await settle()

    const badges = document.querySelectorAll('#alias-list .row__badge')
    const withIcon = badges[0]

    expect(withIcon.dataset.site).toBe('example.com')
    expect(withIcon.querySelector('img')?.getAttribute('src')).toBe(PIXEL)
    expect(withIcon.classList.contains('has-icon')).toBe(true)
  })

  it('senza icona resta la lettera, non un quadrato vuoto', async () => {
    await startPopup({ SITE_ICONS: () => ({}) })
    await settle()

    const badge = document.querySelector('#alias-list .row__badge')

    expect(badge.querySelector('img')).toBeNull()
    expect(badge.textContent).toBe('q')
    expect(badge.classList.contains('has-icon')).toBe(false)
  })

  it("l icona non si chiede mai a un sito, ma solo al contesto di sfondo", async () => {
    // Il difetto che questa prova impedisce e' quello che fanno quasi tutti:
    // chiedere `https://sito/favicon.ico`, cioe' annunciare a ogni sito che
    // qualcuno sta guardando la propria lista di iscrizioni.
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy

    const fake = await startPopup()
    await settle()

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(fake.sent).toContainEqual({ type: 'SITE_ICONS', sites: ['example.com'] })
  })

  it("durante l attesa il bottone dice quanto manca invece di fallire", async () => {
    await startPopup({ COOLDOWN_STATE: () => ({ remaining: 6200, label: 'Ready in 7s' }) })
    await settle()

    const button = document.getElementById('create')

    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.querySelector('.button__label').textContent).toBe('Ready in 7s')
    expect(document.getElementById('create-wait').hidden).toBe(false)
    // L'attesa non e' un errore, e non finisce nella riga degli errori.
    expect(document.getElementById('create-error').hidden).toBe(true)
  })

  it('senza attesa il bottone e aperto e non nomina nessun conto', async () => {
    await startPopup()
    await settle()

    const button = document.getElementById('create')

    expect(button.disabled).toBe(false)
    expect(button.querySelector('.button__label').textContent).toBe('Create an alias')
    expect(document.getElementById('create-wait').hidden).toBe(true)
  })

  it('senza account collegato mostra la schermata di collegamento', async () => {
    await startPopup({
      GET_STATE: () => ({
        domain: 'skudo.me',
        format: 'random_characters',
        injectIcon: false,
        contextMenu: true,
        describeWithSite: true,
        associateSite: true,
        siteIcons: true,
        theme: 'auto',
        signedIn: false,
      }),
    })

    expect(document.getElementById('screen-signin').hidden).toBe(false)
    expect(document.getElementById('screen-main').hidden).toBe(true)
  })
})
