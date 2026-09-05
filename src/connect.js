/**
 * Il flusso di collegamento, guidato da una pagina dell'estensione.
 *
 * ## Perché una pagina e non il popup
 *
 * Due ragioni, entrambe vincolanti.
 *
 * Il codice di conferma va confrontato con quello mostrato sulla scheda di
 * Skudo. Un popup si chiude nel momento esatto in cui l'utente guarda altrove,
 * cioè proprio quando dovrebbe leggerlo.
 *
 * E l'attesa dura fino a due minuti. Il contesto di sfondo viene spento quando
 * è inattivo — su Chromium è un service worker, su Gecko una event page — e un
 * ciclo di attesa avviato lì non sopravvive: `alarms` ha una granularità di un
 * minuto, troppo grossa per una richiesta che ne vive due. Una scheda aperta
 * invece resta viva finché è aperta, e ogni messaggio che manda risveglia lo
 * sfondo per il tempo che serve.
 *
 * Il segreto non passa mai di qui: questa pagina chiede allo sfondo di aprire
 * la richiesta e di ritirare l'esito, e riceve solo i quattro caratteri da
 * mostrare.
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
  const instance = $('instance').value.trim()
  $('server-error').hidden = true
  $('begin').disabled = true

  try {
    const pairing = await send('PAIR_START', { instance, label: describeBrowser() })

    $('code').textContent = pairing.confirmationCode
    connectUrl = pairing.connectUrl
    deadline = Date.now() + pairing.expiresIn * 1000
    show('waiting')

    await openConsentTab()
    poll(pairing.interval * 1000)
  } catch (error) {
    $('server-error').textContent = error.message
    $('server-error').hidden = false
  } finally {
    $('begin').disabled = false
  }
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
  show('done')
}

function expire() {
  clearTimeout(pollTimer)
  send('PAIR_CANCEL').catch(() => {})
  show('expired')
}

/* ------------------------------------------------------------------ *
 * Avvio della pagina
 * ------------------------------------------------------------------ */

async function init() {
  const state = await send('GET_STATE')
  $('instance').value = state.instance
  show('server')

  // Il caso normale è che il server sia quello predefinito e non ci sia niente
  // da scegliere: si parte da soli, e il campo resta lì per chi si autocolloca
  // e preme indietro.
  if (state.instance) begin()
}

$('begin').addEventListener('click', begin)
$('retry').addEventListener('click', () => {
  show('server')
  begin()
})
$('reopen').addEventListener('click', openConsentTab)

// Via d'uscita per chi si autocolloca: senza, la pagina parte da sola verso
// il server predefinito e non c'è modo di cambiarlo.
$('change-server').addEventListener('click', () => {
  clearTimeout(pollTimer)
  send('PAIR_CANCEL').catch(() => {})
  show('server')
})
$('close').addEventListener('click', () => window.close())

init()
