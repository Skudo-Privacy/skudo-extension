import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Il permesso accende l'icona. Lo sfondo girato davvero con un `chrome` finto:
 * quello che si prova e' che dopo "Turn it on" l'icona sia registrata e messa
 * nelle schede aperte, qualunque messaggio si sia perso per strada.
 */
function fakeBrowser({ granted }) {
  const store = { injectIcon: false }
  const registered = []
  const state = { granted }
  const listeners = { added: [], removed: [], message: [] }

  const api = {
    runtime: {
      id: 'skudo',
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener: (fn) => listeners.message.push(fn) },
      getURL: (p) => `chrome-extension://skudo/${p}`,
      getManifest: () => ({ version: '0' }),
    },
    storage: {
      local: {
        get: async (keys) => ({ ...(typeof keys === 'object' ? keys : {}), ...store }),
        set: async (patch) => Object.assign(store, patch),
        remove: async () => {},
      },
      session: { get: async (d) => d, set: async () => {}, remove: async () => {} },
      onChanged: { addListener() {} },
    },
    permissions: {
      contains: async () => state.granted,
      remove: async () => (state.granted = false),
      onAdded: { addListener: (fn) => listeners.added.push(fn) },
      onRemoved: { addListener: (fn) => listeners.removed.push(fn) },
    },
    scripting: {
      getRegisteredContentScripts: async () => registered.slice(),
      registerContentScripts: vi.fn(async (scripts) => registered.push(...scripts)),
      unregisterContentScripts: vi.fn(async () => registered.splice(0)),
      executeScript: vi.fn(async () => []),
    },
    tabs: { query: vi.fn(async () => [{ id: 7 }, { id: 8 }]) },
    contextMenus: undefined,
  }
  return { api, store, state, registered, listeners }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

async function boot(options) {
  const fake = fakeBrowser(options)
  globalThis.chrome = fake.api
  globalThis.browser = undefined
  vi.stubGlobal('__SKUDO_INSTANCE__', 'https://app.skudo.test')
  vi.stubGlobal('__SKUDO_ICONS__', 'https://app.skudo.test/icons')
  vi.resetModules()
  await import('../src/background.js?' + Math.random())
  await settle()
  return fake
}

describe('l icona nei campi', () => {
  beforeEach(() => {
    delete globalThis.chrome
  })

  it('con il permesso gia concesso si accende da sola, senza messaggi', async () => {
    const { store, registered } = await boot({ granted: true })
    expect(store.injectIcon).toBe(true)
    expect(registered).toHaveLength(1)
  })

  it('senza permesso resta spenta e non registra niente', async () => {
    const { store, registered } = await boot({ granted: false })
    expect(store.injectIcon).toBe(false)
    expect(registered).toHaveLength(0)
  })

  it('appena il permesso arriva la registra e la mette nelle schede aperte', async () => {
    const fake = await boot({ granted: false })
    fake.state.granted = true
    for (const fn of fake.listeners.added) await fn({ origins: ['<all_urls>'] })
    await settle()
    expect(fake.store.injectIcon).toBe(true)
    expect(fake.registered).toHaveLength(1)
    const targets = fake.api.scripting.executeScript.mock.calls.map(([c]) => c.target.tabId)
    expect(targets).toEqual([7, 8])
  })

  it('se il permesso viene tolto l icona si spegne e lo script viene tolto', async () => {
    const fake = await boot({ granted: true })
    fake.state.granted = false
    for (const fn of fake.listeners.removed) await fn()
    await settle()
    expect(fake.store.injectIcon).toBe(false)
    expect(fake.registered).toHaveLength(0)
  })
})
