/**
 * L'icona e il pannello, dentro uno shadow DOM chiuso.
 *
 * ## Perché non basta uno stile in linea
 *
 * Questa roba viene disegnata dentro la pagina di qualcun altro, e la pagina di
 * qualcun altro ha il proprio foglio di stile e il proprio JavaScript. Uno
 * stile in linea regge finché il sito non ha una regola `!important` su
 * `img`, e il nostro markup resta comunque leggibile e modificabile dal
 * JavaScript della pagina.
 *
 * Uno shadow root **chiuso** chiude entrambe le porte: le regole del sito non
 * attraversano il confine, e `element.shadowRoot` restituisce `null` a chi
 * prova a guardarci dentro dalla pagina. Il nome dell'elemento ospite è
 * `<skudo-anchor>`, un tag che nessun sito ha motivo di avere in un selettore.
 *
 * Dentro non entra mai niente che arrivi dalla pagina: gli unici testi che
 * mostriamo vengono dal nostro server o sono costanti, e si scrivono con
 * `textContent`. Nessun `innerHTML` con dati.
 */

import { ICON_SIZE } from './anchor.js'

const BRAND = '#0F5E56'
const BRAND_STRONG = '#0B4741'
const SIGNAL = '#C6EA33'

/** Il marchio, disegnato invece che caricato: nessuna richiesta, nessuna CSP. */
const MARK = `<svg viewBox="0 0 24 24" width="${ICON_SIZE}" height="${ICON_SIZE}" aria-hidden="true">
<rect width="24" height="24" rx="5.4" fill="${BRAND}"/>
<g fill="#fff">
<rect x="7" y="6.8" width="11.7" height="2.4" rx="1.2"/>
<circle cx="6" cy="9.9" r="1.2"/>
<rect x="7" y="11.2" width="9.9" height="2.3" rx="1.15"/>
<circle cx="18" cy="13.9" r="1.2"/>
<rect x="4.9" y="14.8" width="12.1" height="2.3" rx="1.15"/>
</g>
</svg>`

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }

/*
 * L'icona non si mostra finché non sa dove stare.
 *
 * Prima compariva subito, alla posizione iniziale, e saltava di venti pixel un
 * fotogramma dopo, quando lo spostamento per scansare le altre estensioni
 * veniva calcolato. Un salto in una pagina che qualcun altro sta guardando si
 * legge come un difetto del sito, non come una nostra animazione. Adesso
 * appare già al posto giusto: prima si posiziona, poi si dissolve dentro.
 *
 * È la stessa disciplina che usa Proton Pass sulla propria icona, ed è una di
 * quelle cose che si notano solo quando mancano.
 */
.icon {
  width: ${ICON_SIZE}px; height: ${ICON_SIZE}px;
  padding: 0; border: 0; background: none;
  display: block; cursor: pointer;
  border-radius: 6px;
  opacity: 0;
  transform: scale(.86);
  /* Niente pointer-events qui: foreignShift() spegne quelli dell'ospite per
     campionare cosa c'e' sotto, e un valore esplicito sul bottone lo
     riaccenderebbe proprio mentre proviamo a nasconderci. */
  transition: opacity 160ms cubic-bezier(.16,1,.3,1), transform 160ms cubic-bezier(.16,1,.3,1);
}
.icon[data-ready='true'] { opacity: .55; transform: scale(1); }
.icon[data-ready='true']:hover,
.icon[data-ready='true']:focus-visible { opacity: 1; transform: scale(1.08); outline: none; }
.icon[data-busy='true'] { opacity: 1; animation: pulse 900ms ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }

.panel {
  width: 288px;
  border-radius: 16px;
  background: #fff;
  color: #000;
  box-shadow:
    0 0 0 1px rgba(0,0,0,.05),
    0 1px 2px rgba(0,0,0,.05),
    0 12px 34px -6px rgba(0,0,0,.22);
  font-size: 13px; line-height: 1.45;
  animation: rise 180ms cubic-bezier(.16,1,.3,1);
  /* L'altezza è animata quando il contenuto cambia: vedi resize(). */
  overflow: hidden;
  transition: height 200ms cubic-bezier(.16,1,.3,1);
}
.panel__body { padding: 14px; }
@keyframes rise { from { opacity: 0; transform: translateY(-6px) scale(.985) } }

/*
 * Una riga di intestazione con il marchio.
 *
 * Un riquadro che compare da solo sopra un campo, senza dire da chi viene, è
 * indistinguibile da quello che farebbe una pagina malintenzionata. Il marchio
 * non è decorazione: è la risposta alla domanda "chi mi sta parlando".
 */
.brandline {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 9px;
  font-size: 11px; font-weight: 700;
  letter-spacing: .04em; text-transform: uppercase;
  color: #8a8a90;
}
.brandline svg { width: 14px; height: 14px; display: block; }

.title { font-weight: 620; font-size: 13.5px; margin-bottom: 3px; letter-spacing: -.005em; }
.sub { color: #6b6b70; font-size: 12px; }

/*
 * L'indirizzo. È la cosa per cui il pannello esiste, quindi ha il suo spazio e
 * un fondo che lo stacca: chi guarda deve trovarlo senza cercarlo, e deve
 * poterlo leggere carattere per carattere, perché un alias si sbaglia a
 * trascrivere.
 */
.alias {
  display: flex; align-items: center; gap: 8px;
  margin: 11px 0 13px; padding: 10px 11px;
  border-radius: 11px;
  background: #f5f5f7;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.04);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px; font-weight: 600;
  letter-spacing: -.01em;
  overflow-wrap: anywhere;
}

.row { display: flex; gap: 8px; }

button.act {
  flex: 1; min-height: 36px;
  border: 0; border-radius: 11px;
  font: inherit; font-weight: 650; font-size: 12.5px;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;
}
button.act:active { transform: scale(.98); }
button.primary { background: ${BRAND}; color: #fff; }
button.primary:hover { background: ${BRAND_STRONG}; }
button.quiet { background: none; box-shadow: inset 0 0 0 1px #dcdce0; color: #000; }
button.quiet:hover { background: #f2f2f4; }
button.act:focus-visible { outline: 2px solid ${BRAND}; outline-offset: 2px; }

ul { list-style: none; padding: 0; margin: 9px 0 0; max-height: 172px; overflow-y: auto; }
li + li { margin-top: 5px; }
li button {
  width: 100%; text-align: left;
  padding: 9px 11px; border: 0; border-radius: 10px;
  background: #f5f5f7; cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.04);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px; color: #000;
  overflow-wrap: anywhere;
  transition: background-color 120ms ease;
}
li button:hover { background: #ebebef; }
li button:focus-visible { outline: 2px solid ${BRAND}; outline-offset: 1px; }

.spinner {
  width: 14px; height: 14px; flex: none;
  border: 2px solid rgba(0,0,0,.12); border-top-color: ${BRAND};
  border-radius: 50%; animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg) } }
.working { display: flex; align-items: center; gap: 9px; color: #6b6b70; }

.bad { color: #c22} 
.tick { color: ${BRAND}; font-weight: 700; }

/*
 * Il tema scuro, scritto due volte di proposito.
 *
 * Non e' pignoleria: su Mullvad Browser e LibreWolf resistFingerprinting e'
 * acceso per difetto e fa rispondere "light" alla media query per tutti,
 * sempre. Chi usa il tema scuro si ritroverebbe un riquadro bianco in faccia
 * sopra una pagina nera, senza poterci fare niente. Quindi la scelta esplicita
 * dell'utente vince, e la media query serve solo quando una scelta non c'e'.
 * Stessa disciplina di popup.css.
 *
 * I selettori sono piatti e non annidati: la nidificazione CSS e' arrivata in
 * Firefox 117, e la base ESR di Mullvad e LibreWolf e' la 115. Annidare qui
 * vorrebbe dire spegnere il tema scuro proprio sui due browser per cui questa
 * regola esiste, e senza nessun errore da nessuna parte.
 */
@media (prefers-color-scheme: dark) {
  :host(:not([data-skudo-theme='light'])) .panel {
    background: #1d2022; color: #f5f5f3;
    box-shadow:
      0 0 0 1px rgba(255,255,255,.07),
      0 1px 2px rgba(0,0,0,.5),
      0 14px 38px -8px rgba(0,0,0,.7);
  }
  :host(:not([data-skudo-theme='light'])) .sub, :host(:not([data-skudo-theme='light'])) .working, :host(:not([data-skudo-theme='light'])) .brandline { color: #9a9aa0; }
  .alias, li button { background: #2a2e31; color: #f5f5f3; box-shadow: inset 0 0 0 1px rgba(255,255,255,.05); }
  li button:hover { background: #33383b; }
  button.quiet { box-shadow: inset 0 0 0 1px #3a3f43; color: #f5f5f3; }
  button.quiet:hover { background: #26292c; }
  button.primary { background: #157468; }
  button.primary:hover { background: #1a8a7c; }
  .spinner { border-color: rgba(255,255,255,.16); }
}

:host([data-skudo-theme='dark']) .panel {
  background: #1d2022; color: #f5f5f3;
  box-shadow:
    0 0 0 1px rgba(255,255,255,.07),
    0 1px 2px rgba(0,0,0,.5),
    0 14px 38px -8px rgba(0,0,0,.7);
}
:host([data-skudo-theme='dark']) .sub, :host([data-skudo-theme='dark']) .working, :host([data-skudo-theme='dark']) .brandline { color: #9a9aa0; }
.alias, li button { background: #2a2e31; color: #f5f5f3; box-shadow: inset 0 0 0 1px rgba(255,255,255,.05); }
li button:hover { background: #33383b; }
button.quiet { box-shadow: inset 0 0 0 1px #3a3f43; color: #f5f5f3; }
button.quiet:hover { background: #26292c; }
button.primary { background: #157468; }
button.primary:hover { background: #1a8a7c; }
.spinner { border-color: rgba(255,255,255,.16); }

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .01ms !important; transition-duration: .01ms !important }
}
`

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Il marchio come nodi, non come stringa.
 *
 * Il bottone dell'icona usa `innerHTML` con una costante, ed è l'unica volta
 * in tutto il pacchetto. Qui serve una seconda copia, dentro il pannello, e
 * una seconda `innerHTML` sarebbe la prima cosa che un revisore degli store va
 * a cercare. Costruirlo a mano costa dieci righe e toglie la domanda.
 */
function markNode(size = 14) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('aria-hidden', 'true')

  const plate = document.createElementNS(SVG_NS, 'rect')
  plate.setAttribute('width', '24')
  plate.setAttribute('height', '24')
  plate.setAttribute('rx', '5.4')
  plate.setAttribute('fill', BRAND)
  svg.appendChild(plate)

  const group = document.createElementNS(SVG_NS, 'g')
  group.setAttribute('fill', '#fff')
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

/**
 * Crea un ospite isolato, posizionato in assoluto sul documento.
 *
 * @returns {{host: HTMLElement, root: ShadowRoot}}
 */
/**
 * Il tema scelto dall'utente, se ne ha scelto uno.
 *
 * `auto` non stampa niente e lascia decidere alla media query. Le altre due
 * vincono su di essa, che e' tutto il punto: vedi il commento sul tema scuro
 * dentro STYLE.
 */
let theme = 'auto'

export function setTheme(next) {
  theme = next === 'dark' || next === 'light' ? next : 'auto'
}

function createHost() {
  const host = document.createElement('skudo-anchor')
  host.style.cssText = 'all:initial;position:absolute;top:0;left:0;z-index:2147483646;display:block'
  if (theme !== 'auto') host.setAttribute('data-skudo-theme', theme)

  // `closed`: dalla pagina, `host.shadowRoot` è null. Il nostro markup non è
  // né leggibile né modificabile dal JavaScript del sito.
  const root = host.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = STYLE
  root.appendChild(style)

  return { host, root }
}

/** L'icona accanto al campo. */
export function createIcon({ title, onActivate }) {
  const { host, root } = createHost()

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'icon'
  button.title = title
  button.setAttribute('aria-label', title)
  // Costante nostra, nessun dato: l'unico innerHTML del file.
  button.innerHTML = MARK
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onActivate()
  })
  root.appendChild(button)

  return {
    host,
    move({ left, top }) {
      host.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    },
    /**
     * L'icona è al posto definitivo: si può mostrare.
     *
     * Chiamata dal ciclo di posizionamento dopo il primo controllo delle icone
     * altrui. Prima di allora la posizione è una supposizione, e mostrarla
     * significherebbe farla saltare sotto gli occhi di chi sta leggendo la
     * pagina di qualcun altro.
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
 * Un pannello e non un lampo di colore: quando qualcosa non funziona, l'utente
 * deve leggere cosa, non indovinarlo. Il contorno rosso che c'era prima
 * significava insieme "non sei collegato", "il limite è finito" e "la rete non
 * risponde", e nessuna delle tre si capiva.
 */
export function createPanel() {
  const { host, root } = createHost()

  const panel = document.createElement('div')
  panel.className = 'panel'

  const inner = document.createElement('div')
  inner.className = 'panel__body'
  panel.appendChild(inner)

  // Chi parla. Un riquadro che compare sopra un campo senza dire da chi viene
  // è indistinguibile da quello che farebbe una pagina malintenzionata, e
  // l'abitudine a fidarsene è esattamente quella da non insegnare.
  const brandline = document.createElement('div')
  brandline.className = 'brandline'
  brandline.appendChild(markNode())
  const brandName = document.createElement('span')
  brandName.textContent = 'Skudo'
  brandline.appendChild(brandName)
  inner.appendChild(brandline)

  const body = document.createElement('div')
  inner.appendChild(body)

  root.appendChild(panel)

  /**
   * Anima l'altezza fra due stati.
   *
   * Il pannello passa da "sto creando" a "ecco l'alias" cambiando altezza di
   * una cinquantina di pixel. Senza questo scatta, e uno scatto sopra il
   * contenuto di qualcun altro sembra un difetto della pagina. Si misura
   * prima, si cambia, si misura dopo, e si lascia fare al CSS.
   */
  const resize = (change) => {
    const before = panel.offsetHeight
    change()
    const after = inner.offsetHeight

    if (!before || before === after) {
      panel.style.height = ''
      return
    }

    panel.style.height = `${before}px`
    // Una lettura forzata: senza, il browser accorpa le due assegnazioni e non
    // c'è nessuna transizione da animare.
    void panel.offsetHeight
    panel.style.height = `${after}px`

    panel.addEventListener(
      'transitionend',
      () => {
        panel.style.height = ''
      },
      { once: true }
    )
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
        const wrap = document.createElement('div')
        wrap.className = 'working'
        const spinner = document.createElement('div')
        spinner.className = 'spinner'
        const label = document.createElement('span')
        label.textContent = text
        wrap.append(spinner, label)
        body.appendChild(wrap)
      })
    },

    /**
     * Alias scritto nel campo.
     *
     * Due casi, e la differenza va detta. Appena creato: si può disfare.
     * Ripescato da questa sessione perché al sito era già stato dato quello:
     * disfare non ha senso (non è stato creato adesso, e potrebbe già essere
     * stato inviato in un altro modulo della stessa pagina), e quello che
     * serve è poterne chiedere un altro apposta.
     */
    created({ email, reused = false, onUndo, onDone, onFresh }) {
      resize(() => {
        clear()
        line('title', reused ? 'Same alias as before' : 'Alias filled in')
        line(
          'sub',
          reused
            ? 'This is the one you already gave this site. Reusing it keeps their view of you in one place.'
            : 'Mail sent here reaches your inbox. Nobody learns your real address.'
        )
        line('alias', email)
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

    /** Alias già esistenti per questo sito, su un modulo di accesso. */
    choose({ aliases, onPick, onDismiss }) {
      resize(() => {
        clear()
        line('title', 'You already have an alias here')
        line('sub', 'Signing in? Use the one you gave this site before.')
        const list = document.createElement('ul')
        for (const alias of aliases) {
          const item = document.createElement('li')
          const button = document.createElement('button')
          button.type = 'button'
          button.textContent = alias.email
          button.addEventListener('click', () => onPick(alias))
          item.appendChild(button)
          list.appendChild(item)
        }
        body.appendChild(list)
        actions([{ label: 'Close', kind: 'quiet', onClick: onDismiss }])
      })
    },

    /** Non ancora collegato: il clic deve portare da qualche parte. */
    signedOut({ onConnect, onDismiss }) {
      resize(() => {
        clear()
        line('title', 'Connect Skudo first')
        line('sub', 'One click, nothing to copy. Then this icon makes aliases for you.')
        actions([
          { label: 'Not now', kind: 'quiet', onClick: onDismiss },
          { label: 'Connect', kind: 'primary', onClick: onConnect },
        ])
      })
    },

    failed({ message, onDismiss }) {
      resize(() => {
        clear()
        line('title', 'That did not work')
        line('sub bad', message)
        actions([{ label: 'Close', kind: 'quiet', onClick: onDismiss }])
      })
    },

    remove: () => host.remove(),
  }
}
