/**
 * Accesso alle API dell'estensione, senza polyfill.
 *
 * La scelta consueta qui è `webextension-polyfill`: lo usano addy.io,
 * SimpleLogin e Firefox Relay. Costa una trentina di kilobyte in ogni contesto
 * in cui viene caricato, content script compreso, cioè su ogni pagina che
 * l'utente apre. Serviva quando Chrome esponeva solo le callback.
 *
 * Da Manifest V3 le API di Chrome restituiscono promesse quando si omette la
 * callback, quindi `browser` e `chrome` si comportano allo stesso modo per
 * tutto quello che usiamo (storage, scripting, runtime, tabs, contextMenus).
 * Il polyfill non serve più: basta scegliere l'oggetto giusto.
 *
 * Restano fuori le API che Chrome non ha promesso, e le differenze vere fra i
 * due motori, che sono elencate in docs/BROWSERS.md e gestite dove capitano,
 * non nascoste sotto un livello di compatibilità.
 */

/** @type {typeof chrome} */
export const api = globalThis.browser ?? globalThis.chrome

/**
 * Il motore su cui stiamo girando.
 *
 * Serve per le poche differenze che non si possono astrarre: la barra laterale
 * (`sidebar_action` su Gecko, `side_panel` su Chromium) e il comportamento dei
 * permessi facoltativi, che su Firefox si possono chiedere solo da un gesto
 * dell'utente.
 */
export const isGecko =
  typeof globalThis.browser !== 'undefined' && !!globalThis.browser.runtime?.getBrowserInfo

/** Il contesto di sfondo è un service worker (Chromium) o una event page (Gecko)? */
export const isServiceWorker = typeof globalThis.ServiceWorkerGlobalScope !== 'undefined'
