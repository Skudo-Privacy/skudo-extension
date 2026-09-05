/**
 * L'icona e il pannello, dentro uno shadow DOM chiuso.
 *
 * ## Perche' non basta uno stile in linea
 *
 * Questa roba viene disegnata dentro la pagina di qualcun altro, e la pagina di
 * qualcun altro ha il proprio foglio di stile e il proprio JavaScript. Uno
 * stile in linea regge finche' il sito non ha una regola `!important` su
 * `img`, e il nostro markup resta comunque leggibile e modificabile dal
 * JavaScript della pagina.
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
 * ## Il disegno
 *
 * Una cosa sola e' rumorosa, l'indirizzo, perche' e' l'unica per cui il
 * pannello esiste. Tutto il resto sta zitto.
 *
 * Nell'indirizzo la parte locale e' in inchiostro pieno e il dominio e'
 * smorzato. Non e' decorazione: e' la risposta alla domanda che uno si fa
 * guardando un elenco di alias, cioe' quale pezzo distingue questo dagli
 * altri. Vale nel pannello e vale in ogni elenco, ed e' il motivo per cui
 * `addressNode()` sta qui e non e' un `textContent` qualunque.
 */

import { addressNode } from '../shared/address.js'
import { TOKENS, TOKENS_DARK } from '../shared/tokens.js'
import { ICON_SIZE, PANEL_WIDTH } from './anchor.js'

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
function strokeIcon(paths, size = 15) {
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

const COPY_PATHS = ['M9.5 9.5h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 20v-9a1.5 1.5 0 0 1 1.5-1.5Z', 'M5.5 15.5H5A1.5 1.5 0 0 1 3.5 14V5A1.5 1.5 0 0 1 5 3.5h9A1.5 1.5 0 0 1 15.5 5v.5']
const TICK_PATHS = ['m5 12.6 4.6 4.6L19.2 7.6']

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
  width: ${ICON_SIZE}px; height: ${ICON_SIZE}px;
  padding: 0; border: 0; background: none;
  display: block; cursor: pointer;
  border-radius: 6px;
  opacity: 0;
  transform: scale(.82);
  transition: opacity 170ms var(--ease), transform 170ms var(--ease);
}
.icon[data-ready='true'] { opacity: .5; transform: scale(1); }
.icon[data-ready='true']:hover,
.icon[data-ready='true']:focus-visible { opacity: 1; transform: scale(1.1); outline: none; }
.icon[data-busy='true'] { opacity: 1; animation: breathe 1.1s ease-in-out infinite; }
@keyframes breathe { 0%,100% { opacity: 1 } 50% { opacity: .4 } }

/* ------------------------------------------------------------------ *
 * Il pannello
 * ------------------------------------------------------------------ */

.panel {
  width: ${PANEL_WIDTH}px;
  border-radius: var(--radius);
  background: var(--paper);
  box-shadow: var(--shadow);
  overflow: hidden;
  animation: rise 200ms var(--ease);
  transition: height var(--slow) var(--ease);
}
@keyframes rise { from { opacity: 0; transform: translateY(-7px) scale(.982) } }

/*
 * Il filo in cima.
 *
 * Verde per quasi tutta la larghezza, lime nell'ultimo tratto. E' il segno di
 * un annullo postale, ed e' l'unico posto in cui il colore forte compare senza
 * che sia successo niente: dice di chi e' questa superficie, e lo dice in tre
 * pixel invece che con un logo grande.
 */
.panel::before {
  content: '';
  display: block;
  height: 3px;
  background: linear-gradient(90deg, var(--brand) 0 72%, var(--signal) 72% 100%);
}

.head {
  display: flex; align-items: center; gap: 7px;
  padding: 12px 16px 0;
}
.head__mark { display: block; flex: none; }
.head__name {
  font-size: 12.5px; font-weight: 640; letter-spacing: -.006em;
}
.head__site {
  margin-left: auto;
  font-size: 11.5px; color: var(--muted);
  max-width: 165px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.body { padding: 11px 16px 16px; }

.title {
  display: flex; align-items: center; gap: 8px;
  font-size: 15.5px; font-weight: 640; letter-spacing: -.013em; line-height: 1.25;
}

/*
 * Il bollo.
 *
 * Compare una volta, quando un alias e' appena stato creato, e non compare
 * altrove. E' il momento in cui e' fatto: un prodotto che festeggia ogni
 * schermata non festeggia niente.
 */
.stamp {
  flex: none;
  width: 19px; height: 19px;
  display: grid; place-items: center;
  border-radius: 50%;
  background: var(--signal);
  color: #16210A;
  animation: stampIn 340ms var(--ease) both;
}
@keyframes stampIn {
  from { transform: scale(.4) rotate(-14deg); opacity: 0 }
  to { transform: none; opacity: 1 }
}
.note {
  margin-top: 5px;
  font-size: 12.5px; line-height: 1.5; color: var(--muted);
  max-width: 46ch;
}
.note.bad { color: var(--alarm); }

/* ------------------------------------------------------------------ *
 * L'indirizzo: l'unica cosa rumorosa
 * ------------------------------------------------------------------ */

.address {
  display: flex; align-items: center; gap: 10px;
  margin: 13px 0 14px;
  padding: 13px 12px 13px 14px;
  border-radius: var(--radius-sm);
  background: var(--label);
  box-shadow: inset 0 0 0 1px var(--hairline);
  position: relative;
  overflow: hidden;
}
.address__text {
  flex: 1; min-width: 0;
  font-family: var(--mono);
  font-size: 14px; line-height: 1.35; letter-spacing: .002em;
  overflow-wrap: anywhere;
}
.address__local { font-weight: 620; color: var(--ink); }
/*
 * Il dominio non si spezza al suo interno.
 *
 * Con overflow-wrap: anywhere sul contenitore, un indirizzo lungo veniva
 * tagliato a metá della parte locale, cioe' esattamente del pezzo che
 * identifica l'alias: "considerable.thunderstor / m7qz@sidegate.org". Tenendo
 * il dominio indivisibile, l'interruzione cade fra le due parti, che e' il
 * punto in cui un indirizzo si legge comunque spezzato.
 */
.address__domain { color: var(--muted); white-space: nowrap; }

/*
 * La linea tratteggiata prima del bottone che copia.
 *
 * E' la strappatura di un talloncino, ed e' l'altra meta' del segno in cima al
 * pannello: due indizi dello stesso mestiere, la posta, invece di uno solo.
 * Dice anche una cosa vera, che quella parte si stacca e se ne va altrove.
 */
.copy {
  flex: none;
  margin-left: 2px; padding-left: 11px;
  border-left: 1px dashed var(--hairline-strong);
  border-radius: 0;
  width: 41px; height: 30px;
  display: grid; place-items: center;
  border: 0; border-radius: var(--radius-xs);
  background: none; color: var(--muted);
  cursor: pointer;
  transition: background-color var(--fast) var(--ease), color var(--fast) var(--ease);
}
.copy:hover { color: var(--ink); }
.copy > svg { transition: transform var(--fast) var(--ease); }
.copy:hover > svg { transform: scale(1.12); }
.copy:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
.copy[data-done='true'] { color: var(--brand); }

/*
 * Il momento in cui e' fatto.
 *
 * Una passata sola, sul blocco dell'indirizzo, quando l'alias arriva o viene
 * copiato. E' l'unica animazione non richiesta da un clic in tutto il
 * pannello, ed e' l'unico uso del lime: un colore forte che compare in
 * continuazione smette di voler dire qualcosa.
 */
.address[data-flash='true']::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, ${'rgba(198, 234, 51, .34)'}, transparent);
  animation: sweep 620ms var(--ease);
  pointer-events: none;
}
@keyframes sweep { from { transform: translateX(-100%) } to { transform: translateX(100%) } }

/* ------------------------------------------------------------------ *
 * Azioni
 * ------------------------------------------------------------------ */

.row { display: flex; gap: 9px; }

button.act {
  flex: 1; min-height: 40px; padding: 0 12px;
  border: 0; border-radius: var(--radius-sm);
  font: inherit; font-size: 13px; font-weight: 620; letter-spacing: -.004em;
  cursor: pointer;
  transition: background-color var(--fast) var(--ease), transform var(--fast) var(--ease);
}
button.act:active { transform: scale(.985); }
button.act:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
button.primary { background: var(--brand); color: var(--brand-ink); }
button.primary:hover { background: var(--brand-hover); }
button.quiet { background: none; box-shadow: inset 0 0 0 1px var(--hairline-strong); color: var(--ink); }
button.quiet:hover { background: var(--label); }

/* ------------------------------------------------------------------ *
 * L'elenco, su un modulo di accesso
 * ------------------------------------------------------------------ */

ul { list-style: none; padding: 0; margin: 12px 0 13px; max-height: 196px; overflow-y: auto; }
li + li { margin-top: 6px; }
li button {
  width: 100%; text-align: left;
  display: block;
  min-height: 54px;
  padding: 10px 12px;
  border: 0; border-radius: var(--radius-sm);
  background: var(--label);
  box-shadow: inset 0 0 0 1px var(--hairline);
  cursor: pointer;
  transition: background-color var(--fast) var(--ease);
}
li button:hover, li button[data-active='true'] { background: var(--label-hover); }
li button:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
li .address__text { font-size: 12.5px; }
li .meta {
  margin-top: 3px;
  font-family: var(--ui);
  font-size: 11px; color: var(--muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ------------------------------------------------------------------ *
 * Attesa
 * ------------------------------------------------------------------ */

/*
 * Non una rotella: la forma di quello che sta per arrivare.
 *
 * Chi guarda sa gia' dove comparira' l'indirizzo, e quando compare non deve
 * ridisegnarsi mezzo pannello sotto gli occhi.
 */
.skeleton {
  height: 52px; margin: 13px 0 14px;
  border-radius: var(--radius-sm);
  background: var(--label);
  box-shadow: inset 0 0 0 1px var(--hairline);
  position: relative; overflow: hidden;
}
.skeleton::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, var(--label-hover), transparent);
  animation: sweep 1.25s var(--ease) infinite;
}

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
  button.appendChild(markNode(ICON_SIZE))
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onActivate()
  })
  scope.appendChild(button)

  return {
    host,
    move({ left, top }) {
      host.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    },
    /**
     * L'icona e' al posto definitivo: si puo' mostrare. Vedi `.icon` in STYLE.
     */
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
 * Il pannello sotto il campo.
 *
 * Un pannello e non un lampo di colore: quando qualcosa non funziona, chi lo
 * legge deve sapere cosa, non indovinarlo. Il contorno rosso che c'era prima
 * significava insieme "non sei collegato", "il limite e' finito" e "la rete non
 * risponde", e nessuna delle tre si capiva.
 */
export function createPanel({ site = '' } = {}) {
  const { host, scope } = createHost()

  const panel = document.createElement('div')
  panel.className = 'panel'
  scope.appendChild(panel)

  /*
   * Chi parla, e per chi.
   *
   * Un riquadro che compare sopra un campo senza dire da chi viene e'
   * indistinguibile da quello che farebbe una pagina malintenzionata, e
   * l'abitudine a fidarsene e' quella da non insegnare. Il nome del sito
   * accanto non e' decorazione: dice a quale indirizzo questo alias resta
   * legato, che e' la cosa che si dimentica.
   */
  const head = document.createElement('div')
  head.className = 'head'
  const mark = markNode(15)
  mark.classList.add('head__mark')
  head.appendChild(mark)
  const name = document.createElement('span')
  name.className = 'head__name'
  name.textContent = 'Skudo'
  head.appendChild(name)
  if (site) {
    const where = document.createElement('span')
    where.className = 'head__site'
    where.textContent = `for ${site}`
    head.appendChild(where)
  }
  panel.appendChild(head)

  const body = document.createElement('div')
  body.className = 'body'
  panel.appendChild(body)

  /**
   * Anima l'altezza fra due stati.
   *
   * Il pannello passa da "sto creando" a "ecco l'alias" cambiando altezza. Senza
   * questo scatta, e uno scatto sopra il contenuto di qualcun altro sembra un
   * difetto della pagina.
   */
  const resize = (change) => {
    const before = panel.offsetHeight
    change()
    const after = head.offsetHeight + body.offsetHeight + 3

    if (!before || before === after) {
      panel.style.height = ''
      return
    }

    panel.style.height = `${before}px`
    void panel.offsetHeight
    panel.style.height = `${after}px`
    panel.addEventListener('transitionend', () => (panel.style.height = ''), { once: true })
  }

  const clear = () => {
    body.textContent = ''
  }

  const line = (className, text) => {
    const el = document.createElement('div')
    el.className = className
    el.textContent = text
    body.appendChild(el)
    return el
  }

  /** Il titolo, con il bollo quando c'e' qualcosa da festeggiare. */
  const title = (text, { stamped = false } = {}) => {
    const el = document.createElement('div')
    el.className = 'title'
    if (stamped) {
      const stamp = document.createElement('span')
      stamp.className = 'stamp'
      stamp.appendChild(strokeIcon(TICK_PATHS, 12))
      el.appendChild(stamp)
    }
    const label = document.createElement('span')
    label.textContent = text
    el.appendChild(label)
    body.appendChild(el)
    return el
  }

  /** Il blocco dell'indirizzo, con il bottone che lo copia. */
  const addressBlock = (email, { flash = false } = {}) => {
    const wrap = document.createElement('div')
    wrap.className = 'address'
    wrap.appendChild(addressNode(email))

    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'copy'
    copy.title = 'Copy'
    copy.setAttribute('aria-label', `Copy ${email}`)
    copy.appendChild(strokeIcon(COPY_PATHS))
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(email)
      } catch {
        // Il permesso puo' mancare: l'indirizzo resta selezionabile a mano, e
        // fingere che sia andata sarebbe peggio che non dire niente.
        return
      }
      copy.dataset.done = 'true'
      copy.textContent = ''
      copy.appendChild(strokeIcon(TICK_PATHS))
      copy.title = 'Copied'
      flashOnce(wrap)
      setTimeout(() => {
        copy.dataset.done = 'false'
        copy.textContent = ''
        copy.appendChild(strokeIcon(COPY_PATHS))
        copy.title = 'Copy'
      }, 1600)
    })
    wrap.appendChild(copy)

    body.appendChild(wrap)
    if (flash) flashOnce(wrap)
    return wrap
  }

  const flashOnce = (el) => {
    el.dataset.flash = 'false'
    void el.offsetWidth
    el.dataset.flash = 'true'
    setTimeout(() => (el.dataset.flash = 'false'), 700)
  }

  const actions = (buttons) => {
    const row = document.createElement('div')
    row.className = 'row'
    for (const { label, kind, onClick } of buttons) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `act ${kind}`
      button.textContent = label
      button.addEventListener('click', onClick)
      row.appendChild(button)
    }
    body.appendChild(row)
    return row
  }

  return {
    host,

    move({ left, top }) {
      host.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    },

    working(text) {
      resize(() => {
        clear()
        title(text)
        const skeleton = document.createElement('div')
        skeleton.className = 'skeleton'
        body.appendChild(skeleton)
      })
    },

    /**
     * Alias scritto nel campo.
     *
     * Due casi, e la differenza va detta. Appena creato: si puo' disfare.
     * Ripescato da questa sessione perche' al sito era gia' stato dato quello:
     * disfare non ha senso, e quello che serve e' poterne chiedere un altro
     * apposta.
     */
    created({ email, reused = false, onUndo, onDone, onFresh }) {
      resize(() => {
        clear()
        title(reused ? 'Same alias as before' : 'Alias filled in', { stamped: !reused })
        addressBlock(email, { flash: !reused })
        line(
          'note',
          reused
            ? `This is the one you already gave ${site || 'this site'}. Reusing it keeps everything they know about you in one place.`
            : `Mail sent here reaches your inbox. ${site || 'This site'} never learns your real address.`
        )
        const spacer = document.createElement('div')
        spacer.style.height = '13px'
        body.appendChild(spacer)
        actions(
          reused
            ? [
                { label: 'Make another', kind: 'quiet', onClick: onFresh },
                { label: 'Done', kind: 'primary', onClick: onDone },
              ]
            : [
                { label: 'Undo', kind: 'quiet', onClick: onUndo },
                { label: 'Done', kind: 'primary', onClick: onDone },
              ]
        )
      })
    },

    /** Alias gia' esistenti per questo sito, su un modulo di accesso. */
    choose({ aliases, onPick, onDismiss }) {
      resize(() => {
        clear()
        title('Use the one you already have')
        line('note', `Signing in? These are the aliases ${site || 'this site'} already knows.`)

        const list = document.createElement('ul')
        for (const alias of aliases) {
          const item = document.createElement('li')
          const button = document.createElement('button')
          button.type = 'button'
          button.appendChild(addressNode(alias.email))
          if (alias.description) {
            const meta = document.createElement('div')
            meta.className = 'meta'
            meta.textContent = alias.description
            button.appendChild(meta)
          }
          button.addEventListener('click', () => onPick(alias))
          item.appendChild(button)
          list.appendChild(item)
        }
        body.appendChild(list)

        // Le frecce scorrono l'elenco, Invio sceglie. Su un modulo di accesso
        // le mani sono gia' sulla tastiera.
        list.addEventListener('keydown', (event) => {
          const buttons = [...list.querySelectorAll('button')]
          const at = buttons.indexOf(document.activeElement)
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const next = at + (event.key === 'ArrowDown' ? 1 : -1)
            buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus()
          }
        })

        actions([{ label: 'Close', kind: 'quiet', onClick: onDismiss }])
      })
    },

    /** Non ancora collegato: il clic deve portare da qualche parte. */
    signedOut({ onConnect, onDismiss }) {
      resize(() => {
        clear()
        title('Connect Skudo first')
        line(
          'note',
          'One click on a Skudo page, nothing to copy. Then this icon makes an alias every time a site asks for your address.'
        )
        const spacer = document.createElement('div')
        spacer.style.height = '14px'
        body.appendChild(spacer)
        actions([
          { label: 'Not now', kind: 'quiet', onClick: onDismiss },
          { label: 'Connect', kind: 'primary', onClick: onConnect },
        ])
      })
    },

    failed({ message, onDismiss }) {
      resize(() => {
        clear()
        title('That did not work')
        line('note bad', message)
        const spacer = document.createElement('div')
        spacer.style.height = '14px'
        body.appendChild(spacer)
        actions([{ label: 'Close', kind: 'quiet', onClick: onDismiss }])
      })
    },

    remove: () => host.remove(),
  }
}
