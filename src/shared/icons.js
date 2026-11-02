/**
 * Le icone dei siti, prese senza dire a nessuno chi le sta guardando.
 *
 * ## Il problema
 *
 * Un elenco di alias con accanto l'icona del sito e' molto piu' leggibile di un
 * elenco di stringhe. Il modo ovvio di ottenerlo, che fanno quasi tutti, e'
 * chiedere l'icona al sito stesso: `https://esempio.com/favicon.ico`. Fatto da
 * dentro un'estensione come questa, quel modo ovvio annuncia a ognuno di quei
 * siti, dall'indirizzo di casa dell'utente, che qualcuno sta guardando la
 * propria lista di iscrizioni. E lo annuncia ogni volta che il popup si apre.
 *
 * ## Come funziona invece
 *
 *   1. Il nome del file e' SHA-256 del dominio, calcolato qui. Il server usa la
 *      stessa formula, quindi non serve chiedergli niente per sapere dove
 *      guardare.
 *   2. Si prova a scaricarlo dall'host delle icone. Se c'e', la richiesta e'
 *      stata il download di un file statico, senza token, senza cookie: nessuno
 *      ha imparato niente su chi e' l'utente.
 *   3. Se non c'e', e solo allora, si chiede al server di procurarselo. E'
 *      l'unica volta in cui un dominio ci passa davanti, e succede una volta
 *      sola per dominio in tutta la vita del servizio, per tutti gli utenti
 *      insieme, perche' la cache del server e' condivisa.
 *   4. Il risultato resta qui sul disco. Le volte successive non c'e' nessuna
 *      richiesta.
 *
 * ## Le richieste partono insieme, non una alla volta
 *
 * Il popup risolve tutte le icone della lista in un colpo, all'apertura, e mai
 * al passaggio del mouse. Un caricamento pigro sarebbe piu' efficiente e
 * direbbe, a chi guarda il traffico, su quale riga si e' fermato l'utente.
 *
 * ## Perche' i byte e non l'indirizzo
 *
 * Le icone si conservano come `data:` e si passano cosi' a chi le disegna. Se
 * si passasse l'indirizzo, sarebbe il browser dell'utente a scaricarle di
 * nuovo, ogni volta, da ogni contesto: dentro il popup, e soprattutto dentro il
 * pannello iniettato in una pagina di terzi, dove una richiesta esterna
 * comparirebbe nella console di quel sito.
 */

import { api } from './browser.js'
import { ICONS_URL, INSTANCE } from './config.js'
import { iconHash, registrableDomain } from './domain.js'

const CACHE_KEY = 'iconCache'

/** Un'icona trovata resta buona a lungo: cambiano di rado. */
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Un buco si ricontrolla dopo cinque minuti.
 *
 * Non e' questo numero a far comparire l'icona appena messa in coda: il
 * server la prepara in 230-300 ms (misurato su produzione), e aspettare che
 * scada un TTL per ritrovarla era il difetto, qualunque valore avesse. Quello
 * lo fa `retry` qui sotto: chi ha appena chiesto un'icona ricontrolla da solo
 * dopo pochi secondi. Il TTL serve solo a non martellare i siti che
 * un'icona davvero non ce l'hanno.
 */
const MISS_TTL_MS = 5 * 60 * 1000

/** Dopo quanto un'icona appena messa in coda si ricontrolla, e quante volte. */
const RETRY_AFTER_MS = 2000
const MAX_RETRIES = 3

/**
 * Quante richieste di preparazione si mandano per apertura.
 *
 * Il server ne accetta dieci al minuto per indirizzo. Mandarne venti
 * significa farsene rifiutare dieci, e quelli non entrerebbero mai in coda.
 */
const MAX_REQUESTS = 8

/**
 * Quante icone si tengono.
 *
 * Un limite serve perche' questo sta in `storage.local`, che e' un disco vero.
 * Duecento icone da un paio di chilobyte sono qualche centinaio di kilobyte:
 * abbastanza da coprire chiunque, poco abbastanza da non pesare.
 */
const MAX_ENTRIES = 200

/** Piu' di cosi' non si chiede in una volta: e' un elenco, non un crawler. */
const MAX_LOOKUPS = 24

async function readCache() {
  const { [CACHE_KEY]: cache = {} } = await api.storage.local.get({ [CACHE_KEY]: {} })
  return cache
}

async function writeCache(cache) {
  const entries = Object.entries(cache)

  if (entries.length > MAX_ENTRIES) {
    // Si buttano le piu' vecchie. Non e' una LRU vera (non si tiene traccia
    // degli usi) e non serve che lo sia: le icone non scadono per uso, scadono
    // per eta'.
    entries.sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
    cache = Object.fromEntries(entries.slice(0, MAX_ENTRIES))
  }

  await api.storage.local.set({ [CACHE_KEY]: cache })
}

/**
 * La voce si puo' usare cosi' com'e', senza andare in rete?
 *
 * Con `retry`, un buco appena messo in coda e' da ricontrollare: il server
 * ha avuto il tempo di prepararlo. Si riscarica soltanto, senza chiedere di
 * nuovo la preparazione.
 */
function fresh(entry, now, retry = false) {
  if (!entry || typeof entry.at !== 'number') return false
  if (entry.data) return now - entry.at < HIT_TTL_MS
  if (retry && entry.asked && (entry.tries || 0) < MAX_RETRIES && now - entry.at >= RETRY_AFTER_MS) {
    return false
  }
  return now - entry.at < MISS_TTL_MS
}

/**
 * Scarica un'icona e la trasforma in `data:`.
 *
 * Restituisce la stringa, oppure null quando non c'e' (che e' la risposta
 * normale per un dominio che il server non ha ancora preso).
 */
async function download(hash) {
  let response
  try {
    response = await fetch(`${ICONS_URL}/${hash}-64.png`, {
      // Niente credenziali: e' la ragione per cui questa strada esiste.
      credentials: 'omit',
      cache: 'force-cache',
    })
  } catch {
    return null
  }

  if (!response.ok) return null

  const blob = await response.blob()

  // Un'icona nostra sta ampiamente sotto i 32 KB. Oltre, non e' roba nostra.
  if (blob.size > 32768 || !blob.type.startsWith('image/')) return null

  // A mano e non con `FileReader`: dentro un service worker di Chromium quella
  // classe non esiste, e il popup funzionerebbe mentre l'icona nel pannello no.
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)

  return `data:image/png;base64,${btoa(binary)}`
}

/**
 * Chiede al server di procurarsi l'icona di un dominio.
 *
 * Non aspetta il risultato e non lo guarda: la risposta e' sempre la stessa per
 * costruzione. L'icona comparira' alla prossima apertura, e non comparira' mai
 * se quel sito non ne ha una.
 */
async function requestFetch(domain) {
  try {
    // Il download va all'host statico, questa va all'applicazione: sono due
    // indirizzi diversi apposta, e non si ricava l'uno dall'altro.
    await fetch(`${INSTANCE}/api/v1/site-icons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ domain }),
      credentials: 'omit',
    })
  } catch {
    // Il limite di frequenza del server risponde 429 e va benissimo: vuol dire
    // che il sistema sta funzionando come previsto.
  }
}

/**
 * Le icone di un elenco di siti.
 *
 * @param {string[]} sites domini, anche con sottodominio o ripetuti
 * @param {{fetchMissing?: boolean}} options
 * @returns {Promise<Record<string, string|null>>} dominio registrabile -> data URL
 */
export async function resolveIcons(sites, { fetchMissing = true, retry = false } = {}) {
  const roots = [...new Set(sites.map(registrableDomain).filter(Boolean))].slice(0, MAX_LOOKUPS)

  if (roots.length === 0) return {}

  const now = Date.now()
  const cache = await readCache()
  const result = {}
  const missing = []

  for (const root of roots) {
    const hash = await iconHash(root)
    const entry = cache[hash]

    if (fresh(entry, now, retry)) {
      result[root] = entry.data || null
      continue
    }

    missing.push({ root, hash, entry })
  }

  if (missing.length === 0) return result

  let requests = 0

  // Tutte insieme: vedi il commento in cima sul perche' non si caricano una
  // alla volta.
  await Promise.all(
    missing.map(async ({ root, hash, entry }) => {
      const data = await download(hash)
      const retrying = Boolean(entry && !entry.data && entry.asked)

      // Un buco gia' chiesto non si richiede: si e' solo riscaricato.
      const ask = !data && fetchMissing && !retrying && requests++ < MAX_REQUESTS
      if (ask) await requestFetch(root)

      cache[hash] = data
        ? { data, at: now }
        : { data: null, at: now, asked: retrying ? true : ask, tries: retrying ? (entry.tries || 0) + 1 : 0 }
      result[root] = data
    })
  )

  await writeCache(cache)

  return result
}

/**
 * Quali domini hanno ancora un buco che vale la pena ricontrollare.
 * Serve a chi disegna per sapere se programmare un secondo giro.
 */
export async function pendingIcons(sites) {
  const roots = [...new Set(sites.map(registrableDomain).filter(Boolean))].slice(0, MAX_LOOKUPS)
  const cache = await readCache()
  const pending = []
  for (const root of roots) {
    const entry = cache[await iconHash(root)]
    if (entry && !entry.data && entry.asked && (entry.tries || 0) < MAX_RETRIES) pending.push(root)
  }
  return pending
}

/** Butta via tutto. Usato quando si scollega l'account. */
export async function forgetIcons() {
  await api.storage.local.remove(CACHE_KEY)
}
