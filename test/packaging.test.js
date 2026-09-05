import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src')
const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'))

function sourceFiles(dir = src, found = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, found)
    else if (path.endsWith('.js')) found.push(path)
  }
  return found
}

/**
 * I commenti vanno tolti prima di cercare: metà di questi file spiega proprio
 * le cose che non si devono fare, e una prova che si accende sulla spiegazione
 * di un divieto non prova niente.
 */
function withoutComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const sources = sourceFiles().map((path) => ({
  path,
  code: withoutComments(readFileSync(path, 'utf8')),
}))

/**
 * Invarianti di sicurezza scritte come prove.
 *
 * Sono le decisioni che è facile disfare per sbaglio mesi dopo, con una riga
 * che sembra innocua e che nessuno rivede. Un commento nel file non le
 * protegge, un test che fallisce sì.
 */
describe('invarianti di sicurezza', () => {
  it('non usa storage.sync da nessuna parte', () => {
    // La chiave API in `sync` finisce sui server di Mozilla o di Google e
    // viene ridistribuita a ogni browser dell'utente. È quello che fanno
    // addy.io e SimpleLogin, ed è la ragione principale per cui questo
    // codice non è un fork del loro. Vedi src/shared/storage.js.
    const offenders = sources.filter((file) => /storage\.sync/.test(file.code))
    expect(offenders.map((f) => f.path)).toEqual([])
  })

  it('il content script non legge il token e non chiama la rete', () => {
    // Gira dentro la pagina di un sito qualunque: quello che non ha, nessuno
    // può rubarglielo.
    const content = withoutComments(readFileSync(join(src, 'content.js'), 'utf8'))
    expect(content).not.toMatch(/getToken|apiToken|storage\.local/)
    expect(content).not.toMatch(/\bfetch\s*\(/)
  })

  it("l'indirizzo del server non è un'impostazione modificabile", () => {
    // Un campo dove scrivere il server è un posto dove chiunque riesca a
    // farsi digitare un indirizzo diverso dirotta l'intero collegamento. È
    // fissato al momento della costruzione: vedi src/shared/config.js.
    const config = readFileSync(join(src, 'shared', 'config.js'), 'utf8')
    expect(config).toMatch(/__SKUDO_INSTANCE__/)

    const storage = withoutComments(readFileSync(join(src, 'shared', 'storage.js'), 'utf8'))
    expect(storage).not.toMatch(/instance/)

    for (const page of ['popup.html', 'connect.html']) {
      expect(readFileSync(join(src, page), 'utf8'), `${page} chiede ancora il server`).not.toMatch(
        /id="instance"/
      )
    }
  })

  it('il segreto del collegamento non passa dalla pagina che guida il flusso', () => {
    // connect.html mostra quattro caratteri e aspetta. Il segreto che ritira
    // il token resta nel contesto di sfondo: se non passa di qui, non può
    // finire in una schermata, in un registro o nella cronologia.
    const connect = withoutComments(readFileSync(join(src, 'connect.js'), 'utf8'))
    expect(connect).not.toMatch(/secret/i)
    expect(connect).not.toMatch(/\bfetch\s*\(/)
  })

  it("non chiede accesso ai siti al momento dell'installazione", () => {
    expect(manifest.host_permissions).toBeUndefined()
    expect(manifest.optional_host_permissions).toEqual(['<all_urls>'])
  })

  it('non dichiara content script nel manifest', () => {
    // Vengono registrati a richiesta, dopo il consenso. Vedi background.js.
    expect(manifest.content_scripts).toBeUndefined()
  })

  it('non chiede permessi che non usa', () => {
    const used = sources.map((f) => f.code).join('\n')
    for (const permission of manifest.permissions) {
      const symbol = permission === 'activeTab' ? 'tabs' : permission
      expect(used, `permesso dichiarato e mai usato: ${permission}`).toMatch(
        new RegExp(`\\.${symbol}\\b`)
      )
    }
  })

  it('la politica di sicurezza non ammette codice non nostro', () => {
    expect(manifest.content_security_policy.extension_pages).toBe(
      "script-src 'self'; object-src 'self'"
    )
  })
})

/**
 * Compatibilità fra i motori. I bersagli sono Firefox, Mullvad Browser,
 * LibreWolf e Chrome: tre su quattro sono Gecko. Vedi docs/BROWSERS.md.
 */
describe('compatibilità del manifest', () => {
  it('dichiara lo sfondo per entrambi i motori', () => {
    // Firefox non supporta background.service_worker e non è previsto che lo
    // faccia; Chrome in MV3 supporta solo quello. Dichiarandoli entrambi,
    // ciascuno prende il proprio.
    expect(manifest.background.scripts).toEqual(['background.js'])
    expect(manifest.background.service_worker).toBe('background.js')
  })

  it('non dichiara i moduli ES nello sfondo', () => {
    // I bundle escono come IIFE autonomi: il supporto ai moduli nel contesto
    // di sfondo non è uniforme fra i due motori.
    expect(manifest.background.type).toBeUndefined()
  })

  it('resta installabile sulla ESR su cui girano Mullvad e LibreWolf', () => {
    expect(manifest.browser_specific_settings.gecko.strict_min_version).toBe('115.0')
    expect(manifest.browser_specific_settings.gecko.id).toBe('extension@skudo.org')
  })

  it('non carica webextension-polyfill', () => {
    // Da MV3 le API di Chrome restituiscono promesse. Il polyfill costerebbe
    // una trentina di kilobyte caricati anche nel content script, cioè su
    // ogni pagina che l'utente apre.
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(pkg.dependencies).toBeUndefined()
    expect(Object.keys(pkg.devDependencies)).not.toContain('webextension-polyfill')
  })
})

describe('file dichiarati', () => {
  const declared = [
    ...Object.values(manifest.icons),
    manifest.action.default_popup,
    manifest.background.service_worker,
    ...Object.values(manifest.sidebar_action.default_icon),
    manifest.sidebar_action.default_panel,
  ]

  it('ogni file dichiarato nel manifest viene prodotto dalla costruzione', () => {
    const produced = new Set([
      'background.js',
      'content.js',
      'popup.js',
      'popup.html',
      'popup.css',
      'connect.html',
      'connect.css',
      ...readdirSync(join(src, 'assets', 'img')).map((name) => `img/${name}`),
    ])
    for (const file of new Set(declared)) {
      expect(produced.has(file), `dichiarato nel manifest ma non prodotto: ${file}`).toBe(true)
    }
  })
})
