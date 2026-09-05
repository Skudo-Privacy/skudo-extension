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

.icon {
  width: ${ICON_SIZE}px; height: ${ICON_SIZE}px;
  padding: 0; border: 0; background: none;
  display: block; cursor: pointer;
  opacity: 0.55;
  border-radius: 6px;
  transition: opacity 140ms ease, transform 140ms ease;
}
.icon:hover, .icon:focus-visible { opacity: 1; transform: scale(1.08); outline: none; }
.icon[data-busy='true'] { opacity: 1; animation: pulse 900ms ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }

.panel {
  width: 288px;
  padding: 14px;
  border-radius: 14px;
  background: #fff;
  color: #000;
  box-shadow: 0 2px 6px rgba(0,0,0,.06), 0 10px 32px rgba(0,0,0,.16);
  font-size: 13px; line-height: 1.45;
  animation: rise 160ms cubic-bezier(.16,1,.3,1);
}
@keyframes rise { from { opacity: 0; transform: translateY(-4px) } }

.title { font-weight: 620; font-size: 13px; margin-bottom: 2px; }
.sub { color: #6b6b70; font-size: 12px; }

.alias {
  display: flex; align-items: center; gap: 8px;
  margin: 10px 0 12px; padding: 9px 10px;
  border-radius: 10px; background: #f4f4f6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px; font-weight: 600;
  overflow-wrap: anywhere;
}

.row { display: flex; gap: 8px; }

button.act {
  flex: 1; min-height: 34px;
  border: 0; border-radius: 10px;
  font: inherit; font-weight: 600; font-size: 12.5px;
  cursor: pointer;
}
button.primary { background: ${BRAND}; color: #fff; }
button.quiet { background: none; border: 1px solid #dcdce0; color: #000; }
button.act:hover { filter: brightness(1.08); }

ul { list-style: none; padding: 0; margin: 8px 0 0; }
li + li { margin-top: 4px; }
li button {
  width: 100%; text-align: left;
  padding: 8px 10px; border: 0; border-radius: 9px;
  background: #f4f4f6; cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px; color: #000;
  overflow-wrap: anywhere;
}
li button:hover { background: #eaeaee; }

.spinner {
  width: 14px; height: 14px; flex: none;
  border: 2px solid rgba(0,0,0,.12); border-top-color: ${BRAND};
  border-radius: 50%; animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg) } }
.working { display: flex; align-items: center; gap: 9px; color: #6b6b70; }

.bad { color: #c22} 
.tick { color: ${BRAND}; font-weight: 700; }

@media (prefers-color-scheme: dark) {
  .panel { background: #1d2022; color: #f5f5f3; box-shadow: 0 2px 6px rgba(0,0,0,.4), 0 10px 32px rgba(0,0,0,.5); }
  .sub, .working { color: #9a9aa0; }
  .alias, li button { background: #2a2e31; color: #f5f5f3; }
  li button:hover { background: #33383b; }
  button.quiet { border-color: #3a3f43; color: #f5f5f3; }
  .spinner { border-color: rgba(255,255,255,.16); }
}

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .01ms !important; transition-duration: .01ms !important }
}
`

/**
 * Crea un ospite isolato, posizionato in assoluto sul documento.
 *
 * @returns {{host: HTMLElement, root: ShadowRoot}}
 */
function createHost() {
  const host = document.createElement('skudo-anchor')
  host.style.cssText = 'all:initial;position:absolute;top:0;left:0;z-index:2147483646;display:block'

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
  const body = document.createElement('div')
  body.className = 'panel'
  root.appendChild(body)

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
      clear()
      const wrap = document.createElement('div')
      wrap.className = 'working'
      const spinner = document.createElement('div')
      spinner.className = 'spinner'
      const label = document.createElement('span')
      label.textContent = text
      wrap.append(spinner, label)
      body.appendChild(wrap)
    },

    /** Alias creato e già scritto nel campo, con la possibilità di disfare. */
    created({ email, onUndo, onDone }) {
      clear()
      line('title', 'Alias filled in')
      line('sub', 'Mail sent here reaches your inbox. Nobody learns your real address.')
      line('alias', email)
      actions([
        { label: 'Undo', kind: 'quiet', onClick: onUndo },
        { label: 'Done', kind: 'primary', onClick: onDone },
      ])
    },

    /** Alias già esistenti per questo sito, su un modulo di accesso. */
    choose({ aliases, onPick, onDismiss }) {
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
    },

    /** Non ancora collegato: il clic deve portare da qualche parte. */
    signedOut({ onConnect, onDismiss }) {
      clear()
      line('title', 'Connect Skudo first')
      line('sub', 'One click, nothing to copy. Then this icon makes aliases for you.')
      actions([
        { label: 'Not now', kind: 'quiet', onClick: onDismiss },
        { label: 'Connect', kind: 'primary', onClick: onConnect },
      ])
    },

    failed({ message, onDismiss }) {
      clear()
      line('title', 'That did not work')
      line('sub bad', message)
      actions([{ label: 'Close', kind: 'quiet', onClick: onDismiss }])
    },

    remove: () => host.remove(),
  }
}
