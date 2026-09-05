/**
 * Stato dell'estensione su disco.
 *
 * ## Perché `storage.local` e mai `storage.sync`
 *
 * addy.io e SimpleLogin tengono la chiave API in `browser.storage.sync`. È
 * comodo (l'utente accede su un browser e si ritrova configurato sugli altri)
 * e per un servizio qualunque sarebbe una scelta ragionevole.
 *
 * Per noi no. `sync` significa che la chiave viene caricata sui server di
 * Mozilla o di Google, in chiaro rispetto a loro, e ridistribuita a ogni
 * browser dove l'utente ha fatto l'accesso. Quella chiave apre l'elenco
 * completo dei suoi alias, cioè la mappa di ogni servizio a cui è iscritto:
 * esattamente la cosa che sta usando Skudo per non far sapere in giro. Non si
 * può vendere "il tuo indirizzo non lo vede nessuno" e poi depositare da Google
 * la chiave che lo rivela.
 *
 * `local` resta sul dispositivo. La configurazione va rifatta su ogni browser,
 * ed è il prezzo giusto.
 */

import { api } from './browser.js'

/** Chiavi separate: il token si legge solo dove serve, il resto liberamente. */
const TOKEN_KEY = 'apiToken'

/** @typedef {'random_characters'|'uuid'|'random_words'|'custom'} AliasFormat */

const DEFAULTS = {
  domain: 'skudo.me',
  format: 'random_characters',
  /** Icona nei campi email delle pagine. Spenta finché l'utente non la accende. */
  injectIcon: false,
  /** Voce nel menu contestuale. */
  contextMenu: true,
  /**
   * Descrizione precompilata col dominio del sito, così l'elenco degli alias
   * nell'app si documenta da solo invece di essere una colonna di stringhe
   * casuali.
   */
  describeWithSite: true,
  /**
   * Tema. Non `auto` di sistema: su Mullvad Browser e LibreWolf
   * `prefers-color-scheme` è falsato da resistFingerprinting e riporta sempre
   * chiaro. La media query serve solo a scegliere il valore iniziale.
   * Vedi docs/BROWSERS.md.
   */
  theme: 'auto',
}

export async function getSettings() {
  const stored = await api.storage.local.get(DEFAULTS)
  return { ...DEFAULTS, ...stored }
}

export async function setSettings(patch) {
  await api.storage.local.set(patch)
  return getSettings()
}

/**
 * Il token, letto solo dal contesto di sfondo.
 *
 * Non esiste nessun percorso che lo mandi a un content script: quello gira
 * dentro la pagina di un sito qualunque, e un XSS su quel sito potrebbe
 * leggerselo. Il content script chiede "creami un alias" e riceve indietro una
 * stringa.
 */
export async function getToken() {
  const { [TOKEN_KEY]: token } = await api.storage.local.get({ [TOKEN_KEY]: '' })
  return token
}

export async function setToken(token) {
  await api.storage.local.set({ [TOKEN_KEY]: token })
}

export async function clearToken() {
  await api.storage.local.remove(TOKEN_KEY)
}

export async function isSignedIn() {
  return (await getToken()).length > 0
}

export { DEFAULTS }
