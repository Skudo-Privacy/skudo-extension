/**
 * L'icona nel campo, il menu che ne esce, e il messaggio che arriva dopo.
 *
 * ## Perche' non basta uno stile in linea
 *
 * Questa roba viene disegnata dentro la pagina di qualcun altro, e la pagina di
 * qualcun altro ha il proprio foglio di stile e il proprio JavaScript. Uno
 * stile in linea regge finche' il sito non ha una regola `!important` su `img`,
 * e il nostro markup resta comunque leggibile e modificabile dal JavaScript
 * della pagina.
 *
 * Uno shadow root chiuso chiude entrambe le porte: le regole del sito non
 * attraversano il confine, e `element.shadowRoot` restituisce `null` a chi
 * prova a guardarci dentro dalla pagina. Il nome dell'elemento ospite e'
 * `<skudo-anchor>`, un tag che nessun sito ha motivo di avere in un selettore.
 *
 * Dentro non entra mai niente che arrivi dalla pagina: gli unici testi che
 * mostriamo vengono dal nostro server o sono costanti, e si scrivono con
 * `textContent`.
 *
 * ## Una riga sola, ripetuta
 *
 * La versione precedente aveva sei stati e sei impianti diversi: un titolo con
 * un paragrafo, un blocco monospaziato, una fila di bottoni, un elenco, uno
 * scheletro. Sei modi di disporre le cose in una finestra da duecentocinquanta
 * pixel, e il risultato sembrava fatto in casa perche' lo era.
 *
 * Qui c'e' un componente solo, la riga: icona a sinistra, titolo, sottotitolo.
 * Ogni stato e' un insieme di righe. Il caricamento non e' una schermata, e' il
 * sottotitolo della riga che hai premuto; l'errore nemmeno, e porta il "riprova"
 * dentro di se'. E' l'impianto del dropdown di Proton Pass, ed e' il motivo per
 * cui il loro sta in piedi in duecentocinquanta pixel.
 *
 * La riga e' anche il bottone. Non c'e' una fila di azioni in fondo perche' non
 * serve: quello che si puo' fare e' quello che si vede.
 */

import { addressNode } from '../shared/address.js'
import { TOKENS, TOKENS_DARK } from '../shared/tokens.js'
import { MENU_WIDTH } from './anchor.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Il marchio, disegnato invece che caricato: nessuna richiesta, nessuna CSP,
 * e nessun file da tenere allineato con quello degli store.
 */
function markNode(size = 16, plate = true) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('aria-hidden', 'true')

  if (plate) {
    const bg = document.createElementNS(SVG_NS, 'rect')
    bg.setAttribute('width', '24')
    bg.setAttribute('height', '24')
    bg.setAttribute('rx', '5.4')
    bg.setAttribute('fill', 'var(--brand)')
    svg.appendChild(bg)
  }

  const group = document.createElementNS(SVG_NS, 'g')
  group.setAttribute('fill', plate ? '#fff' : 'currentColor')
  for (const [x, y, w, h] of [
    [7, 6.8, 11.7, 2.4],
    [7, 11.2, 9.9, 2.3],
    [4.9, 14.8, 12.1, 2.3],
  ]) {
    const bar = document.createElementNS(SVG_NS, 'rect')
    bar.setAttribute('x', String(x))
    bar.setAttribute('y', String(y))
    bar.setAttribute('width', String(w))
    bar.setAttribute('height', String(h))
    bar.setAttribute('rx', String(h / 2))
    group.appendChild(bar)
  }
  for (const [cx, cy] of [
    [6, 9.9],
    [18, 13.9],
  ]) {
    const dot = document.createElementNS(SVG_NS, 'circle')
    dot.setAttribute('cx', String(cx))
    dot.setAttribute('cy', String(cy))
    dot.setAttribute('r', '1.2')
    group.appendChild(dot)
  }
  svg.appendChild(group)
  return svg
}

/** Un'icona di tratto, costruita a nodi. */
function strokeIcon(paths, size = 16) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.9')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
  }
  return svg
}

const ICONS = {
  mask: [
    'M3.6 8.4c3-1.2 5.7-1.2 8.4 0 2.7-1.2 5.4-1.2 8.4 0 0 5.4-2.1 8.4-4.5 8.4-1.6 0-2.7-1.1-3.9-2.6-1.2 1.5-2.3 2.6-3.9 2.6-2.4 0-4.5-3-4.5-8.4Z',
  ],
  reuse: ['M20 12a8 8 0 1 1-2.6-5.9', 'M20.5 4.5V10h-5.4'],
  plus: ['M12 5.5v13', 'M5.5 12h13'],
  link: ['M10.5 13.5 13.5 10.5', 'M8.8 15.2a3.1 3.1 0 0 1 0-4.4l2-2', 'M15.2 8.8a3.1 3.1 0 0 1 0 4.4l-2 2'],
  alert: ['M12 8.5v5', 'M12 16.6v.2', 'M12 3.8 2.9 19.6h18.2L12 3.8Z'],
  tick: ['m5 12.6 4.6 4.6L19.2 7.6'],
  mute: ['M4.2 4.2 19.8 19.8', 'M14.5 5.5v13l-4.6-3.8H6.2v-5.4h3.7l1.4-1.2'],
  copy: [
    'M9.5 9.5h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 20v-9a1.5 1.5 0 0 1 1.5-1.5Z',
    'M5.5 15.5H5A1.5 1.5 0 0 1 3.5 14V5A1.5 1.5 0 0 1 5 3.5h9A1.5 1.5 0 0 1 15.5 5v.5',
  ],
  more: ['M6 12h.1', 'M12 12h.1', 'M18 12h.1'],
}

const STYLE = `
:host { all: initial; }

.scope {
${TOKENS}
  color: var(--ink);
  font-family: var(--ui);
  -webkit-font-smoothing: antialiased;
}

* { box-sizing: border-box; margin: 0; }

/* ------------------------------------------------------------------ *
 * L'icona nel campo
 * ------------------------------------------------------------------ */

/*
 * Non si mostra finche' non sa dove stare.
 *
 * Prima compariva subito, alla posizione iniziale, e saltava di venti pixel un
 * fotogramma dopo, quando lo spostamento per scansare le altre estensioni
 * veniva calcolato. Un salto dentro la pagina di qualcun altro si legge come un
 * difetto del sito, non come una nostra animazione.
 */
.icon {
  padding: 0; border: 0; background: none;
  display: block; cursor: pointer;
  border-radius: 6px;
  opacity: 0;
  transform: scale(.82);
  transition: opacity 170ms var(--ease), transform 170ms var(--ease);
}
.icon[data-ready='true'] { opacity: .5; transform: scale(1); }
.icon[data-ready='true']:hover,
.icon[data-ready='true']:focus-visible { opacity: 1; transform: scale(1.08); outline: none; }
.icon[data-busy='true'] { opacity: 1; animation: breathe 1.1s ease-in-out infinite; }
@keyframes breathe { 0%,100% { opacity: 1 } 50% { opacity: .4 } }

/* ------------------------------------------------------------------ *
 * Il menu
 * ------------------------------------------------------------------ */

.menu {
  width: ${MENU_WIDTH}px;
  border-radius: 13px;
  background: var(--paper);
  box-shadow: var(--shadow);
  overflow: hidden;
  animation: rise 170ms var(--ease);
}
@keyframes rise { from { opacity: 0; transform: translateY(-6px) scale(.985) } }

/*
 * L'intestazione dice a cosa serve questo menu, non chi lo manda.
 *
 * "Skudo" con il logo lo sapevamo gia' noi; chi legge sta compilando un modulo
 * e vuole sapere perche' gli e' comparsa una finestra. Il titolo e' il campo,
 * il nome del sito sta nel sottotitolo delle righe dove serve, e a destra c'e'
 * l'unica cosa che si puo' voler fare a un menu che non si voleva: spegnerlo.
 */
.head {
  display: flex; align-items: center; gap: 6px;
  height: 32px;
  padding: 0 6px 0 12px;
  border-bottom: 1px solid var(--hairline);
}
.head__title {
  flex: 1; min-width: 0;
  font-size: 12px; font-weight: 620; letter-spacing: -.004em;
  color: var(--muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.head__mark { display: block; flex: none; opacity: .9; }

.ghost {
  flex: none;
  width: 24px; height: 24px;
  display: grid; place-items: center;
  padding: 0; border: 0; border-radius: 7px;
  background: none; color: var(--muted);
  cursor: pointer;
  transition: background-color var(--fast) var(--ease), color var(--fast) var(--ease);
}
.ghost:hover { background: var(--label); color: var(--ink); }
.ghost:focus-visible { outline: 2px solid var(--brand); outline-offset: -1px; }

/* ------------------------------------------------------------------ *
 * La riga: l'unico componente
 * ------------------------------------------------------------------ */

.rows { list-style: none; padding: 0; margin: 0; max-height: 244px; overflow-y: auto; }

.row {
  width: 100%;
  display: flex; align-items: flex-start; gap: 10px;
  padding: 9px 12px;
  border: 0; background: none;
  font: inherit; color: inherit; text-align: left;
  cursor: pointer;
  transition: background-color var(--fast) var(--ease);
}
.row:hover:not(:disabled), .row:focus-visible { background: var(--label); outline: none; }
.row:disabled { cursor: default; }
.row + .row { border-top: 1px solid var(--hairline); }

/*
 * L'icona della riga su una piastrella, non nuda.
 *
 * Una piastrella tinta da' alla colonna delle icone un bordo verticale su cui
 * l'occhio si appoggia scorrendo l'elenco. Senza, le icone galleggiano e le
 * righe sembrano paragrafi.
 */
.row__icon {
  flex: none;
  width: 28px; height: 28px;
  display: grid; place-items: center;
  border-radius: 8px;
  background: var(--label);
  color: var(--ink-soft);
}
.row--accent .row__icon { background: var(--brand); color: #fff; }
.row--warn .row__icon { background: var(--label); color: var(--alarm); }

.row__text { flex: 1; min-width: 0; padding-top: 1px; }
/*
 * Titolo e sottotitolo si impilano.
 *
 * Sono due span, e senza questo andavano in linea: "Hide my email" e la sua
 * spiegazione finivano appiccicate sulla stessa riga, e il titolo con
 * l'ellissi non si accorciava perche' inline non ha una larghezza da
 * accorciare.
 */
.row__title {
  display: block;
  font-size: 13px; font-weight: 620; letter-spacing: -.006em; line-height: 1.3;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.row__sub {
  display: block;
  margin-top: 1px;
  font-size: 11.5px; line-height: 1.4; color: var(--muted);
}
.row__sub .address__text { font-family: var(--mono); font-size: 11.5px; }
.row__sub.bad { color: var(--alarm); }
.row:disabled .row__title { color: var(--muted); }

.row__aside {
  flex: none; align-self: center;
  color: var(--muted);
}

/* Attesa dentro il sottotitolo, non al posto della schermata. */
.row__sub .waiting { display: flex; align-items: center; gap: 6px; }
.spinner {
  width: 11px; height: 11px; flex: none;
  border: 1.6px solid var(--hairline-strong);
  border-top-color: var(--brand);
  border-radius: 50%;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg) } }

.retry { font-weight: 620; text-decoration: underline; }

/* ------------------------------------------------------------------ *
 * Il messaggio che arriva dopo
 *
 * Riempito il campo, il menu ha finito. Quello che resta da dire e' una riga:
 * cos'e' stato scritto, e come disfarlo. Un pannello che chiede "Done" per
 * chiudersi fa premere un bottone in piu' per niente: qui si chiude da solo, e
 * "Undo" resta li' il tempo che serve a cambiare idea.
 * ------------------------------------------------------------------ */

.toast {
  width: ${MENU_WIDTH}px;
  display: flex; align-items: center; gap: 9px;
  padding: 9px 10px 9px 12px;
  border-radius: 12px;
  background: var(--paper);
  box-shadow: var(--shadow);
  animation: rise 170ms var(--ease);
}
.toast__mark { flex: none; display: block; }
.toast__text { flex: 1; min-width: 0; }
.toast__title { font-size: 12px; font-weight: 620; letter-spacing: -.004em; }
.toast__address { margin-top: 1px; font-family: var(--mono); font-size: 11.5px; }
.toast__undo {
  flex: none;
  padding: 5px 10px;
  border: 0; border-radius: 999px;
  background: var(--label);
  color: var(--ink); font: inherit; font-size: 11.5px; font-weight: 620;
  cursor: pointer;
  transition: background-color var(--fast) var(--ease);
}
.toast__undo:hover { background: var(--label-hover); }
.toast__undo:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }

/*
 * Il filo che si consuma.
 *
 * Il messaggio se ne va da solo, e chi lo guarda deve poter vedere quanto tempo
 * resta invece di scoprirlo quando sparisce. E' l'unico posto in cui il colore
 * forte compare, ed e' un'informazione, non una decorazione.
 */
.toast__life {
  position: absolute; left: 0; right: 0; bottom: 0;
  height: 2px;
  transform-origin: left;
  background: var(--signal);
  animation: drain var(--life, 7000ms) linear both;
}
@keyframes drain { from { transform: scaleX(1) } to { transform: scaleX(0) } }
.toast { position: relative; }

/* ------------------------------------------------------------------ *
 * Tema scuro
 *
 * Scritto due volte di proposito: su Mullvad Browser e LibreWolf
 * resistFingerprinting fa rispondere "light" alla media query per tutti,
 * sempre, quindi la scelta esplicita dell'utente deve poter vincere. I
 * selettori sono piatti e non annidati, perche' la nidificazione CSS e'
 * arrivata in Firefox 117 e la base ESR di quei due browser e' la 115:
 * annidare avrebbe spento il tema scuro proprio dove serve.
 * ------------------------------------------------------------------ */

@media (prefers-color-scheme: dark) {
  :host(:not([data-skudo-theme='light'])) .scope {
${TOKENS_DARK}
  }
}

:host([data-skudo-theme='dark']) .scope {
${TOKENS_DARK}
}

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important }
  .toast__life { display: none }
}
`

/**
 * Il tema scelto dall'utente, se ne ha scelto uno.
 *
 * `auto` non stampa niente e lascia decidere alla media query. Le altre due
 * vincono su di essa, che e' tutto il punto: vedi il commento sul tema scuro.
 */
let theme = 'auto'

export function setTheme(next) {
  theme = next === 'dark' || next === 'light' ? next : 'auto'
}

/**
 * Crea un ospite isolato, posizionato in assoluto sul documento.
 *
 * @returns {{host: HTMLElement, scope: HTMLElement}}
 */
function createHost() {
  const host = document.createElement('skudo-anchor')
  host.style.cssText = 'all:initial;position:absolute;top:0;left:0;z-index:2147483646;display:block'
  if (theme !== 'auto') host.setAttribute('data-skudo-theme', theme)

  const root = host.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = STYLE
  root.appendChild(style)

  // I token stanno su un elemento interno e non su `:host`, cosi' `all: initial`
  // sull'ospite non se li porta via.
  const scope = document.createElement('div')
  scope.className = 'scope'
  root.appendChild(scope)

  return { host, scope }
}

/** L'icona accanto al campo. */
export function createIcon({ title, onActivate }) {
  const { host, scope } = createHost()

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'icon'
  button.title = title
  button.setAttribute('aria-label', title)
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onActivate()
  })
  scope.appendChild(button)

  let drawnAt = 0

  return {
    host,
    move({ left, top }) {
      host.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    },
    /** L'icona si adatta all'altezza del campo: vedi iconSize() in anchor.js. */
    setSize(size) {
      if (size === drawnAt) return
      drawnAt = size
      button.style.width = `${size}px`
      button.style.height = `${size}px`
      button.textContent = ''
      button.appendChild(markNode(size))
    },
    /** L'icona e' al posto definitivo: si puo' mostrare. Vedi `.icon` in STYLE. */
    setReady() {
      button.dataset.ready = 'true'
    },
    setBusy(busy) {
      button.dataset.busy = String(busy)
    },
    setTitle(next) {
      button.title = next
      button.setAttribute('aria-label', next)
    },
    remove: () => host.remove(),
  }
}

/**
 * Il menu che esce dall'icona.
 *
 * Espone una cosa sola: `show(title, rows)`. Ogni stato dell'estensione e' un
 * titolo e un elenco di righe, e non c'e' un secondo modo di disporre le cose.
 */
export function createMenu({ onPause } = {}) {
  const { host, scope } = createHost()

  const menu = document.createElement('div')
  menu.className = 'menu'
  scope.appendChild(menu)

  const head = document.createElement('div')
  head.className = 'head'

  const mark = markNode(14)
  mark.classList.add('head__mark')
  head.appendChild(mark)

  const headTitle = document.createElement('span')
  headTitle.className = 'head__title'
  head.appendChild(headTitle)

  if (onPause) {
    // L'unica cosa che si puo' voler fare a un menu che non si voleva:
    // spegnerlo per questo sito. Un'estensione che compare dove non serve e
    // non si puo' zittire diventa quella che si disinstalla.
    const pause = document.createElement('button')
    pause.type = 'button'
    pause.className = 'ghost'
    pause.title = 'Do not suggest on this site'
    pause.setAttribute('aria-label', 'Do not suggest on this site')
    pause.appendChild(strokeIcon(ICONS.mute, 15))
    pause.addEventListener('click', onPause)
    head.appendChild(pause)
  }

  menu.appendChild(head)

  const list = document.createElement('ul')
  list.className = 'rows'
  menu.appendChild(list)

  // Le frecce scorrono le righe, Invio sceglie. Su un modulo le mani sono gia'
  // sulla tastiera, e un menu che si usa solo col mouse costa un viaggio.
  list.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const rows = [...list.querySelectorAll('button:not(:disabled)')]
    const at = rows.indexOf(document.activeElement)
    const next = at + (event.key === 'ArrowDown' ? 1 : -1)
    rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus()
  })

  /**
   * Una riga.
   *
   * @param {{icon: string[], title: string, sub?: string|Node, tone?: string,
   *   aside?: string[], disabled?: boolean, onClick?: () => void}} spec
   */
  function row(spec) {
    const item = document.createElement('li')

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'row'
    if (spec.tone) button.classList.add(`row--${spec.tone}`)
    button.disabled = Boolean(spec.disabled)

    const icon = document.createElement('span')
    icon.className = 'row__icon'
    icon.appendChild(strokeIcon(spec.icon, 16))
    button.appendChild(icon)

    const text = document.createElement('span')
    text.className = 'row__text'

    const title = document.createElement('span')
    title.className = 'row__title'
    title.textContent = spec.title
    text.appendChild(title)

    if (spec.sub !== undefined) {
      const sub = document.createElement('span')
      sub.className = spec.tone === 'warn' ? 'row__sub bad' : 'row__sub'
      if (typeof spec.sub === 'string') sub.textContent = spec.sub
      else sub.appendChild(spec.sub)
      text.appendChild(sub)
    }

    button.appendChild(text)

    if (spec.aside) {
      const aside = document.createElement('span')
      aside.className = 'row__aside'
      aside.appendChild(strokeIcon(spec.aside, 15))
      button.appendChild(aside)
    }

    if (spec.onClick) button.addEventListener('click', spec.onClick)

    item.appendChild(button)
    return { item, button, text }
  }

  /** Il sottotitolo mentre si aspetta: una rotella e una parola, dentro la riga. */
  function waitingNode(text) {
    const wrap = document.createElement('span')
    wrap.className = 'waiting'
    const spin = document.createElement('span')
    spin.className = 'spinner'
    const label = document.createElement('span')
    label.textContent = text
    wrap.append(spin, label)
    return wrap
  }

  return {
    host,
    icons: ICONS,
    waitingNode,
    addressNode,

    move({ left, top }) {
      host.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    },

    /**
     * Disegna il menu.
     *
     * @param {string} title  a cosa serve, non chi lo manda
     * @param {Array}  specs  le righe, in ordine
     * @returns {Map<string, {button: HTMLElement, text: HTMLElement}>} per nome,
     *   cosi' chi ha premuto una riga puo' sostituirne il sottotitolo senza
     *   ridisegnare il menu e senza farlo saltare sotto il puntatore.
     */
    show(title, specs) {
      headTitle.textContent = title
      list.textContent = ''

      const handles = new Map()
      for (const spec of specs) {
        const built = row(spec)
        list.appendChild(built.item)
        if (spec.name) handles.set(spec.name, built)
      }

      list.querySelector('button:not(:disabled)')?.focus({ preventScroll: true })
      return handles
    },

    /** Sostituisce il sottotitolo di una riga, lasciando tutto il resto fermo. */
    replaceSub(handle, node) {
      const sub = handle.text.querySelector('.row__sub')
      if (!sub) return
      sub.textContent = ''
      sub.className = 'row__sub'
      if (typeof node === 'string') sub.textContent = node
      else sub.appendChild(node)
    },

    remove: () => host.remove(),
  }
}

/**
 * Il messaggio dopo il riempimento: cos'e' stato scritto, e come disfarlo.
 *
 * Si chiude da solo. Un pannello che chiede "Done" per andarsene fa premere un
 * bottone in piu' a chi ha appena finito quello che voleva fare.
 */
export function createToast({ email, onUndo, life = 7000 }) {
  const { host, scope } = createHost()

  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.style.setProperty('--life', `${life}ms`)

  const mark = markNode(20)
  mark.classList.add('toast__mark')
  toast.appendChild(mark)

  const text = document.createElement('div')
  text.className = 'toast__text'

  const title = document.createElement('div')
  title.className = 'toast__title'
  title.textContent = 'Alias filled in'
  text.appendChild(title)

  const address = document.createElement('div')
  address.className = 'toast__address'
  address.appendChild(addressNode(email))
  text.appendChild(address)

  toast.appendChild(text)

  if (onUndo) {
    const undo = document.createElement('button')
    undo.type = 'button'
    undo.className = 'toast__undo'
    undo.textContent = 'Undo'
    undo.addEventListener('click', onUndo)
    toast.appendChild(undo)
  }

  const bar = document.createElement('div')
  bar.className = 'toast__life'
  toast.appendChild(bar)

  scope.appendChild(toast)

  return {
    host,
    move({ left, top }) {
      host.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    },
    remove: () => host.remove(),
  }
}
