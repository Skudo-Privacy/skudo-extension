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

function baseState() {
  return {
    domain: 'skudo.me',
    format: 'random_characters',
    injectIcon: false,
    contextMenu: true,
    describeWithSite: true,
    associateSite: true,
    siteIcons: true,
    theme: 'auto',
    signedIn: true,
    pausedSites: [],
  }
}

function fakeChrome(overrides = {}) {
  const handlers = {
    GET_STATE: () => baseState(),
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
  it('con un sito davanti mette i suoi alias in cima, sotto il suo nome', async () => {
    await startPopup()

    expect(document.getElementById('site').textContent).toBe('example.com')
    const headings = [...document.querySelectorAll('#alias-list .list__heading')].map((h) => h.textContent)
    expect(headings).toEqual(['On example.com', 'Recent'])
    // Quello del sito prima, e senza doppioni con gli ultimi.
    expect(document.querySelectorAll('#alias-list .row')).toHaveLength(2)
    expect(document.querySelector('#alias-list .row').dataset.id).toBe('a1')
  })

  it('si apre con la ricerca vuota e con il primo alias gia scelto', async () => {
    const fake = await startPopup()

    // Il sito non e' un filtro nascosto nella barra: li' sembrava la ricerca
    // rotta. E' una sezione, e la barra resta libera.
    expect(document.getElementById('search').value).toBe('')
    expect(document.getElementById('search-clear').hidden).toBe(true)
    expect(fake.sent.some((m) => m.type === 'ALIASES_FOR_SITE')).toBe(true)
    expect(fake.sent.some((m) => m.type === 'RECENT_ALIASES')).toBe(true)
    expect(document.querySelector('#detail .detail')).not.toBeNull()
    expect(document.querySelector('#alias-list .row').getAttribute('aria-selected')).toBe('true')
  })

  it('le frecce spostano la scelta e Esc svuota la ricerca', async () => {
    await startPopup()
    const search = document.getElementById('search')

    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }))
    await settle()
    expect(document.querySelectorAll('#alias-list .row')[1].getAttribute('aria-selected')).toBe('true')

    search.value = 'harbour'
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await settle()
    expect(search.value).toBe('')
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

  it('aperto su un sito senza alias mostra comunque gli altri, senza titoli inutili', async () => {
    await startPopup({ ALIASES_FOR_SITE: () => [] })

    expect(document.querySelectorAll('#alias-list .row')).toHaveLength(2)
    expect(document.querySelector('#alias-list .list__heading')).toBeNull()
  })

  it('una ricerca che non trova niente lo dice, e un errore non si spaccia per nessun risultato', async () => {
    await startPopup({ SEARCH_ALIASES: () => [] })
    const search = document.getElementById('search')
    search.value = 'zzz'
    search.dispatchEvent(new Event('input'))
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(document.getElementById('list-empty').textContent).toContain('Nothing matching "zzz"')

    await startPopup({
      SEARCH_ALIASES: () => {
        throw new Error('boom')
      },
    })
    const again = document.getElementById('search')
    again.value = 'zzz'
    again.dispatchEvent(new Event('input'))
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(document.getElementById('list-empty').textContent).not.toContain('Nothing matching')
  })

  it('copiare un alias senza sito lo associa a quello che si sta guardando', async () => {
    const fake = await startPopup({ RECENT_ALIASES: () => ALIASES, ALIASES_FOR_SITE: () => [ALIASES[1]] })

    document.querySelector('#alias-list .row').click()
    await settle()
    document.querySelector('.address-copy').click()
    await settle()
    await settle()

    const update = fake.sent.find((m) => m.type === 'UPDATE_ALIAS')
    expect(update).toMatchObject({ id: 'a2', site: 'example.com', siteRoot: 'example.com' })
  })

  it('copiare un alias che ha gia un sito non lo sposta', async () => {
    const fake = await startPopup()

    document.querySelector('#alias-list .row').click()
    await settle()
    document.querySelector('.address-copy').click()
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

  it('senza nessun alias la colonna di destra invita, non resta vuota', async () => {
    await startPopup({ RECENT_ALIASES: () => [], ALIASES_FOR_SITE: () => [] })

    const blank = document.querySelector('#detail .blank')
    expect(blank).not.toBeNull()
    expect(blank.textContent).toContain('No aliases yet')
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
    expect(document.querySelectorAll('#alias-list .row')).toHaveLength(2)
  })

  it('cancella quando si conferma, e la scelta passa al prossimo', async () => {
    const fake = await startPopup()

    document.querySelector('#alias-list .row').click()
    await settle()

    const buttons = () => [...document.querySelectorAll('#detail button')]
    buttons().find((b) => b.textContent === 'Delete alias').click()
    await settle()

    buttons().find((b) => b.textContent === 'Delete for good').click()
    await settle()

    expect(fake.sent).toContainEqual({ type: 'DELETE_ALIAS', id: 'a1' })
    expect(document.querySelectorAll('#alias-list .row')).toHaveLength(1)
    expect(document.querySelector('#alias-list .row').dataset.id).toBe('a2')
    expect(document.querySelector('#detail .detail')).not.toBeNull()
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

  it('un icona appena messa in coda si ricontrolla da sola', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let calls = 0
    const fake = await startPopup({
      SITE_ICONS: () => (++calls === 1 ? { icons: {}, pending: ['example.com'] } : { icons: { 'example.com': PIXEL }, pending: [] }),
    })
    await settle()
    expect(document.querySelector('#alias-list .row__badge img')).toBeNull()

    await vi.advanceTimersByTimeAsync(3000)
    await settle()

    expect(fake.sent.filter((m) => m.type === 'SITE_ICONS')).toHaveLength(2)
    expect(document.querySelector('#alias-list .row__badge img')?.getAttribute('src')).toBe(PIXEL)
    vi.useRealTimers()
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

  describe('impostazioni', () => {
    it('le sezioni si cambiano con le schede e una sola e visibile', async () => {
      await startPopup()
      document.getElementById('tab-look').click()

      const visible = [...document.querySelectorAll('.spanel')].filter((panel) => !panel.hidden)
      expect(visible.map((panel) => panel.dataset.panel)).toEqual(['look'])
      expect(document.getElementById('tab-look').getAttribute('aria-selected')).toBe('true')
      expect(document.getElementById('tab-pages').getAttribute('aria-selected')).toBe('false')
    })

    it('mette in pausa il sito davanti e lo riattiva', async () => {
      const fake = await startPopup({ GET_STATE: () => ({ ...baseState(), pausedSites: [] }) })

      document.getElementById('pause-here').click()
      await settle()
      expect(fake.sent).toContainEqual({ type: 'SET_SETTINGS', patch: { pausedSites: ['example.com'] } })
    })

    it('il tema si sceglie con i tre tasti affiancati', async () => {
      const fake = await startPopup()
      const dark = document.querySelector('input[name="opt-theme"][value="dark"]')
      dark.checked = true
      dark.dispatchEvent(new Event('change'))
      await settle()

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(fake.sent).toContainEqual({ type: 'SET_SETTINGS', patch: { theme: 'dark' } })
    })

    it('svuota la cache delle icone', async () => {
      const fake = await startPopup()
      document.getElementById('clear-icons').click()
      await settle()
      expect(fake.sent.some((m) => m.type === 'CLEAR_ICONS')).toBe(true)
    })
  })
})

describe('il popup su telefono', () => {
  let query

  beforeEach(() => {
    query = globalThis.matchMedia
    globalThis.matchMedia = (media) => ({
      matches: media.includes('pointer: coarse'),
      media,
      addEventListener() {},
      removeEventListener() {},
    })
    document.documentElement.classList.remove('mobile')
  })

  afterEach(() => {
    globalThis.matchMedia = query
    document.documentElement.classList.remove('mobile')
  })

  it('si mette in modalita mobile e parte dall elenco, senza il dettaglio', async () => {
    await startPopup()
    expect(document.documentElement.classList.contains('mobile')).toBe(true)
    expect(document.getElementById('screen-main').dataset.view).toBe('list')
  })

  it('toccare una riga apre il dettaglio, e Indietro torna all elenco', async () => {
    await startPopup()
    document.querySelector('.row').click()
    expect(document.getElementById('screen-main').dataset.view).toBe('detail')
    document.querySelector('.detail__back').click()
    expect(document.getElementById('screen-main').dataset.view).toBe('list')
  })

  it('cancellare un alias riporta all elenco', async () => {
    await startPopup()
    document.querySelector('.row').click()
    document.querySelector('.detail__foot .button--danger').click()
    ;[...document.querySelectorAll('.detail__foot .button')].find((b) => /for good/.test(b.textContent)).click()
    await settle()
    expect(document.getElementById('screen-main').dataset.view).toBe('list')
  })

  it('non porta la tastiera sul campo della nota dopo aver creato un alias', async () => {
    await startPopup({ CREATE_ALIAS: () => ({ id: 'n1', email: 'new.alias@skudo.me', description: '', site: '', active: true }) })
    document.getElementById('create').click()
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(document.getElementById('screen-main').dataset.view).toBe('detail')
    expect(document.activeElement?.id).not.toBe('detail-note')
  })

  it('su desktop non c e nessuna classe mobile e il dettaglio e sempre a fianco', async () => {
    globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    await startPopup()
    expect(document.documentElement.classList.contains('mobile')).toBe(false)
  })
})

describe('l icona nei campi si accende dal permesso', () => {
  it('"Turn it on" nel popup chiede lo sfondo di accendere l icona anche nelle schede aperte', async () => {
    const fake = await startPopup()
    fake.api.permissions.request = async () => true
    document.getElementById('opt-inject').checked = true
    document.getElementById('opt-inject').dispatchEvent(new Event('change'))
    await settle()
    await settle()
    expect(fake.sent.some((m) => m.type === 'ENABLE_FIELD_ICON')).toBe(true)
  })
})
