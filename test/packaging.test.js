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
    // connect.html apre la scheda di approvazione e aspetta. Il segreto che
    // ritira il token resta nel contesto di sfondo: se non passa di qui, non
    // può finire in una schermata, in un registro o nella cronologia.
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

  it('non dichiara una versione minima in cui non funzionerebbe', () => {
    // `optional_host_permissions` esiste da Firefox 128. Dichiarare 115, come
    // facevamo, non rendeva l'estensione compatibile con la 115: la rendeva
    // installabile dove il permesso di leggere le pagine non si può nemmeno
    // chiedere, e l'interruttore sarebbe tornato indietro da solo senza un
    // errore da nessuna parte. Trovato da `web-ext lint`.
    const min = Number(manifest.browser_specific_settings.gecko.strict_min_version.split('.')[0])
    expect(min).toBeGreaterThanOrEqual(128)
    expect(manifest.browser_specific_settings.gecko.id).toBe('extension@skudo.org')
  })

  it('dichiara di non raccogliere niente', () => {
    // Firefox chiede a ogni estensione di dire cosa raccoglie. Per noi la
    // risposta è "niente", e va scritta: un prodotto che vende il fatto di non
    // sapere niente dei propri utenti non lascia il campo in bianco.
    expect(manifest.browser_specific_settings.gecko.data_collection_permissions).toEqual({
      required: ['none'],
    })
  })

  it('i verbi che leggono gli alias non sono raggiungibili da una pagina', () => {
    // RECENT_ALIASES e SEARCH_ALIASES restituiscono alias che l'utente ha già.
    // Un content script che potesse chiamarli darebbe a qualunque sito, per il
    // tramite di un difetto nostro, un pezzo della mappa dei servizi a cui
    // quella persona è iscritta: esattamente la cosa che Skudo esiste per non
    // far sapere in giro.
    const background = withoutComments(readFileSync(join(src, 'background.js'), 'utf8'))

    for (const verb of ['RECENT_ALIASES', 'SEARCH_ALIASES', 'SET_ALIAS_ACTIVE']) {
      const handler = background.slice(background.indexOf(`async ${verb}(`))
      const body = handler.slice(0, handler.indexOf('\n  },'))
      expect(body, `${verb} deve verificare l'origine del messaggio`).toMatch(/fromOurOwnUi\(sender\)/)
    }
  })

  it('il content script non può cancellare un alias qualunque', () => {
    // Può disfare quello che ha appena creato, e nient'altro. Vedi
    // UNDOABLE_KEY in src/background.js.
    const background = withoutComments(readFileSync(join(src, 'background.js'), 'utf8'))
    const handler = background.slice(background.indexOf('async DELETE_ALIAS('))
    const body = handler.slice(0, handler.indexOf('\n  },'))
    expect(body).toMatch(/fromOurOwnUi\(sender\)/)
    expect(body).toMatch(/isUndoable\(id\)/)
  })

  it('non chiede il permesso di leggere i dati dell account', () => {
    // `account-details` era nell'insieme concesso e non lo usava nessuno:
    // l'unico chiamante era sparito insieme al vecchio flusso di accesso. Un
    // permesso che non serve è superficie regalata a chi ruba il token.
    for (const file of sources) {
      expect(file.code, file.path).not.toMatch(/account-details/)
    }
  })

  it("uscire dall'account revoca il token sul server", () => {
    // Cancellarlo dal disco del browser non basta: chi se lo fosse portato via
    // prima non verrebbe toccato dall'uscita.
    const background = withoutComments(readFileSync(join(src, 'background.js'), 'utf8'))
    const handler = background.slice(background.indexOf('async SIGN_OUT('))
    const body = handler.slice(0, handler.indexOf('\n  },'))
    expect(body).toMatch(/revokeSelf\(\)/)
  })

  it('il CSS del menu non contiene apici inversi', () => {
    // Il foglio di stile del menu vive dentro un template literal, e un apice
    // inverso in un commento CSS lo chiude a meta': la costruzione fallisce con
    // un errore di sintassi JavaScript su una riga che parla di tipografia. E'
    // successo quattro volte scrivendo commenti che citavano un nome di
    // proprieta'. La costruzione lo prende, ma solo dopo aver perso il giro.
    const ui = readFileSync(join(src, 'content', 'ui.js'), 'utf8')
    const opening = ui.indexOf('const STYLE = `') + 'const STYLE = `'.length
    const closing = ui.indexOf('`\n', ui.indexOf('prefers-reduced-motion'))
    const style = ui.slice(opening, closing)

    expect(style.includes('`'), 'un apice inverso qui rompe la costruzione').toBe(false)
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
