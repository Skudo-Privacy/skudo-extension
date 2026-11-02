/**
 * Il flusso di collegamento, guidato da una pagina dell'estensione.
 *
 * ## Perché una pagina e non il popup
 *
 * L'attesa dura fino a due minuti. Il contesto di sfondo viene spento quando
 * è inattivo (su Chromium è un service worker, su Gecko una event page) e un
 * ciclo di attesa avviato lì non sopravvive: `alarms` ha una granularità di un
 * minuto, troppo grossa per una richiesta che ne vive due. Una scheda aperta
 * invece resta viva finché è aperta, e ogni messaggio che manda risveglia lo
 * sfondo per il tempo che serve.
 *
 * Il segreto non passa mai di qui: questa pagina chiede allo sfondo di aprire
 * la richiesta e di ritirare l'esito, e non vede mai altro.
 */

import { api } from './shared/browser.js'
import { describeBrowser } from './shared/pairing.js'

const $ = (id) => document.getElementById(id)

let pollTimer = null
let deadline = 0
let consentTabId = null
let connectUrl = ''

async function send(type, payload = {}) {
  const response = await api.runtime.sendMessage({ type, ...payload })
  if (!response?.ok) throw new Error(response?.error || 'Something went wrong.')
  return response.data
}

function show(step) {
  for (const section of document.querySelectorAll('.step')) {
    section.hidden = section.id !== `step-${step}`
  }
}

/* ------------------------------------------------------------------ *
 * Avvio
 * ------------------------------------------------------------------ */

async function begin() {
  show('waiting')
  $('error').hidden = true

  let pairing
  try {
    pairing = await send('PAIR_START', { label: describeBrowser() })
  } catch (error) {
    // L'errore resta su questa schermata invece di rimbalzare altrove: chi
    // legge sta aspettando, e spostarlo su una pagina diversa gli farebbe
    // perdere il filo di cosa stava facendo.
    $('error').textContent = error.message
    $('error').hidden = false
    return
  }

  connectUrl = pairing.connectUrl
  deadline = Date.now() + pairing.expiresIn * 1000

  await openConsentTab()
  poll(pairing.interval * 1000)
}

async function openConsentTab() {
  const tab = await api.tabs.create({ url: connectUrl, active: true })
  consentTabId = tab.id
}

/* ------------------------------------------------------------------ *
 * Attesa
 * ------------------------------------------------------------------ */

function poll(interval) {
  clearTimeout(pollTimer)

  pollTimer = setTimeout(async () => {
    if (Date.now() > deadline) return expire()

    let result
    try {
      result = await send('PAIR_CLAIM')
    } catch {
      // Un colpo a vuoto sulla rete non è una risposta: si riprova finché il
      // tempo non è scaduto.
      return poll(interval)
    }

    if (result.status === 'connected') return finish(result.username)
    if (result.status === 'expired') return expire()

    poll(interval)
  }, interval)
}

async function finish(username) {
  clearTimeout(pollTimer)

  // La scheda di Skudo ha finito il suo lavoro. Si chiude solo se l'abbiamo
  // aperta noi, e senza fare rumore se l'utente l'ha già chiusa a mano.
  if (consentTabId !== null) {
    try {
      await api.tabs.remove(consentTabId)
    } catch {
      /* già chiusa */
    }
  }

  $('done-body').textContent = username
    ? `Signed in as ${username}. You can close this tab.`
    : 'You can close this tab.'

  // Prima di dire "fatto", si chiede l'unica cosa che ha bisogno di un
  // permesso. Qui e non nelle impostazioni perche' e' adesso che la persona sta
  // guardando: un interruttore in una schermata che nessuno apre non verra'
  // mai acceso, e l'icona nei campi e' meta' del prodotto.
  await offerFieldIcon()
}

/**
 * Chiede il permesso per l'icona nei campi: prima a parole, poi al browser.
 *
 * Salta il passaggio se il permesso c'e' gia' (per esempio a un secondo
 * collegamento): chiedere di nuovo una cosa gia' concessa fa dubitare che la
 * prima volta sia servita a qualcosa.
 */
async function offerFieldIcon() {
  let granted = false
  try {
    granted = await api.permissions.contains({ origins: ['<all_urls>'] })
  } catch {
    granted = false
  }

  // Gia' concesso (secondo collegamento, o permesso dato altrove): niente da
  // chiedere, ma l'icona deve essere accesa davvero, non solo permessa.
  if (granted) {
    await enableFieldIcon()
    return show('done')
  }

  show('icon')
}

/**
 * Il si'.
 *
 * Nessun `await` prima di `permissions.request()`, ed e' obbligatorio: su
 * Gecko quella chiamata vale solo dentro il gestore di un gesto dell'utente, e
 * aspettare una promessa prima fa scadere il gesto. La richiesta verrebbe
 * rifiutata senza che a nessuno venga chiesto niente, il che assomiglia
 * moltissimo a un rifiuto dell'utente e non lo e'.
 */
async function acceptFieldIcon() {
  $('icon-error').hidden = true

  let granted
  try {
    granted = await api.permissions.request({ origins: ['<all_urls>'] })
  } catch {
    // Qui il permesso e' davvero il problema: e' la richiesta stessa che ha
    // fallito.
    $('icon-error').textContent = 'Your browser did not let that through. You can turn it on later in settings.'
    $('icon-error').hidden = false
    return
  }

  if (!granted) {
    // Un no non e' un errore e non si insiste: si va avanti, e resta
    // l'interruttore nelle impostazioni.
    return show('done')
  }

  // Il permesso e' concesso: da qui l'icona si accende da sola, e non dipende
  // da altro che dallo sfondo.
  await enableFieldIcon()
  show('done')
}

/**
 * Accende l'icona: registra lo script e lo mette nelle schede aperte.
 *
 * Su Gecko concedere un permesso host puo' far ripartire lo sfondo proprio in
 * questo istante, e il primo messaggio puo' trovare nessuno ad ascoltare. Non
 * e' un rifiuto, quindi non e' un errore da mostrare: si riprova in silenzio.
 * E non serve nemmeno che riesca, per l'icona: lo sfondo, alla ripartenza,
 * rilegge il permesso e si accende da solo (vedi `alignIconSetting`).
 */
async function enableFieldIcon() {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await send('ENABLE_FIELD_ICON')
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }
}

function expire() {
  clearTimeout(pollTimer)
  send('PAIR_CANCEL').catch(() => {})
  show('expired')
}

/* ------------------------------------------------------------------ *
 * Avvio della pagina
 * ------------------------------------------------------------------ */

// Non c'è niente da chiedere prima di cominciare: il server è uno solo e lo
// sa già il pacchetto. Vedi src/shared/config.js.
begin()

$('retry').addEventListener('click', begin)
$('reopen').addEventListener('click', openConsentTab)
$('close').addEventListener('click', () => window.close())
$('icon-yes').addEventListener('click', acceptFieldIcon)
$('icon-no').addEventListener('click', () => show('done'))
