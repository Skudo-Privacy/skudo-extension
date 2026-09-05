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
  { id: 'a1', email: 'quiet.pine8x@skudo.me', description: 'example.com', active: true },
  { id: 'a2', email: 'lone.harbour2k@skudo.me', description: '', active: false },
]

function fakeChrome(overrides = {}) {
  const handlers = {
    GET_STATE: () => ({
      domain: 'skudo.me',
      format: 'random_characters',
      injectIcon: false,
      contextMenu: true,
      describeWithSite: true,
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
        query: async () => [{ id: 1, url: 'https://example.com/signup' }],
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
    expect(document.getElementById('list-heading').textContent).toBe('Already on this site')
    expect(document.querySelectorAll('#alias-list li')).toHaveLength(1)
  })

  it('senza un sito davanti diventa l elenco dei propri alias', async () => {
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

    expect(document.getElementById('site').textContent).toBe('Your aliases')
    expect(document.getElementById('list-heading').textContent).toBe('Recent')

    const rows = document.querySelectorAll('#alias-list li')
    expect(rows).toHaveLength(2)
    // Il secondo è spento: deve vedersi.
    expect(rows[1].classList.contains('is-off')).toBe(true)
  })

  it('non nomina mai l indirizzo di inoltro', async () => {
    await startPopup()

    // Non è una prova sul testo per pignoleria: il vincolo è che di quella
    // cosa non si parli, e una riga aggiunta per comodità mesi dopo sarebbe
    // il modo esatto in cui rientrerebbe.
    const text = document.body.textContent.toLowerCase()
    for (const word of ['recipient', 'forward', 'inoltro', 'real address']) {
      expect(text).not.toContain(word)
    }
  })

  it('accende e spegne un alias', async () => {
    const fake = await startPopup()

    const row = document.querySelectorAll('#alias-list li')[0]
    const toggle = row.querySelector('[aria-label="Turn off"]')
    expect(toggle).not.toBeNull()

    toggle.click()
    await settle()

    expect(fake.sent).toContainEqual({ type: 'SET_ALIAS_ACTIVE', id: 'a1', active: false })
    expect(row.classList.contains('is-off')).toBe(true)
  })

  it('chiede conferma prima di cancellare, e non cancella se si dice di no', async () => {
    const fake = await startPopup()

    const row = document.querySelectorAll('#alias-list li')[0]
    row.querySelector('[aria-label="Delete"]').click()

    const confirm = row.querySelector('.row-alias__confirm')
    expect(confirm).not.toBeNull()

    ;[...confirm.querySelectorAll('button')].find((b) => b.textContent === 'Keep').click()
    await settle()

    expect(fake.sent.some((m) => m.type === 'DELETE_ALIAS')).toBe(false)
    expect(row.isConnected).toBe(true)
  })

  it('cancella quando si conferma', async () => {
    const fake = await startPopup()

    const row = document.querySelectorAll('#alias-list li')[0]
    row.querySelector('[aria-label="Delete"]').click()
    const confirm = row.querySelector('.row-alias__confirm')
    ;[...confirm.querySelectorAll('button')].find((b) => b.textContent === 'Delete').click()
    await settle()

    expect(fake.sent).toContainEqual({ type: 'DELETE_ALIAS', id: 'a1' })
    expect(row.isConnected).toBe(false)
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
    expect(document.getElementById('list-heading').textContent).toBe('Results')
  })

  it('senza account collegato mostra la schermata di collegamento', async () => {
    await startPopup({
      GET_STATE: () => ({
        domain: 'skudo.me',
        format: 'random_characters',
        injectIcon: false,
        contextMenu: true,
        describeWithSite: true,
        theme: 'auto',
        signedIn: false,
      }),
    })

    expect(document.getElementById('screen-signin').hidden).toBe(false)
    expect(document.getElementById('screen-main').hidden).toBe(true)
  })
})
