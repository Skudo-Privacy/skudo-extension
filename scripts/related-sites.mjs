/*
 * Genera src/shared/related-sites.js dai dati di apple/password-manager-resources.
 *
 * Perche' generato e non letto a runtime: una richiesta di rete per sapere
 * che vons.com e safeway.com sono lo stesso account direbbe a qualcuno quali
 * siti l'utente sta visitando, che e' esattamente cio' che questo prodotto
 * esiste per evitare. Stessa scelta gia' fatta per la Public Suffix List.
 *
 * Uso: node scripts/related-sites.mjs [percorso-shared-credentials.json]
 * Senza argomento scarica il file da GitHub.
 */
import { writeFileSync, readFileSync } from 'node:fs'

const SOURCE =
  'https://raw.githubusercontent.com/apple/password-manager-resources/main/quirks/shared-credentials.json'

const local = process.argv[2]
const raw = local
  ? JSON.parse(readFileSync(local, 'utf8'))
  : await (await fetch(SOURCE)).json()

/*
 * Due forme nel file di partenza, e vanno tenute distinte.
 *
 * `shared` e' un gruppo simmetrico: chi ha un account su uno ce l'ha su
 * tutti. `from`/`to` e' a senso unico, e la direzione conta: da a2hosting.com
 * si finisce su hosting.com, non il contrario. Appiattire la seconda forma
 * nella prima vorrebbe dire proporre su hosting.com un alias nato su
 * a2hosting.com anche a chi con a2hosting non ha mai avuto niente a che fare.
 *
 * I gruppi si scrivono una volta sola e i domini puntano al loro indice: la
 * forma "ogni dominio elenca i fratelli" pesava 86 KB per 413 domini, perche'
 * un gruppo di quindici supermercati veniva ripetuto quindici volte.
 */
const groups = []
const index = {}
const directed = {}

for (const entry of raw) {
  if (Array.isArray(entry.shared) && entry.shared.length > 1) {
    const members = [...new Set(entry.shared.map((d) => d.toLowerCase()))].sort()
    const at = groups.push(members) - 1
    for (const domain of members) index[domain] = at
    continue
  }

  if (Array.isArray(entry.from) && Array.isArray(entry.to)) {
    for (const from of entry.from) {
      const key = from.toLowerCase()
      const targets = entry.to.map((d) => d.toLowerCase()).filter((d) => d !== key)
      if (targets.length) directed[key] = [...new Set([...(directed[key] ?? []), ...targets])].sort()
    }
  }
}

const asObject = (o) =>
  '{\n' +
  Object.keys(o)
    .sort()
    .map((k) => `  '${k}': ${JSON.stringify(o[k])},`)
    .join('\n') +
  '\n}'

const file = `/*
 * NON MODIFICARE A MANO. Generato da scripts/related-sites.mjs.
 *
 * Gruppi di siti che condividono lo stesso account, da
 * apple/password-manager-resources (licenza MIT, vedi NOTICE.md).
 *
 * A cosa serve qui: un alias creato su safeway.com vale anche su vons.com,
 * perche' e' un login solo. Senza questa tabella il popup aperto su vons.com
 * non trova niente e fa creare un secondo alias per lo stesso account.
 *
 * ${Object.keys(index).length} domini in ${groups.length} gruppi simmetrici,
 * piu' ${Object.keys(directed).length} legami a senso unico.
 */
export const GROUPS = ${JSON.stringify(groups, null, 0).replace(/\],\[/g, '],\n  [').replace(/^\[/, '[\n  ').replace(/\]$/, ',\n]')}

export const INDEX = ${asObject(index)}

export const DIRECTED = ${asObject(directed)}

/**
 * Gli altri domini che condividono l'account con questo. Mai se stesso.
 *
 * Chi la usa deve dire da dove viene l'alias che mostra: suggerire una cosa
 * salvata per un dominio diverso senza dirlo e' il modo in cui un elenco di
 * comodo diventa una trappola. Vale anche per noi, non solo per le password.
 */
export function relatedSites(domain) {
  if (typeof domain !== 'string') return []

  const key = domain.toLowerCase()
  const group = INDEX[key] === undefined ? [] : GROUPS[INDEX[key]]

  return [...new Set([...group, ...(DIRECTED[key] ?? [])])].filter((d) => d !== key)
}
`

/*
 * La coda del file: la lista dei riquadri di terze parti. Sono quattro domini
 * e cambiano di rado, ma stanno qui e non a mano nel file generato, altrimenti
 * la prossima rigenerazione se li porterebbe via.
 */
const FRAMES_SOURCE =
  'https://raw.githubusercontent.com/apple/password-manager-resources/main/quirks/websites-that-ask-for-credentials-for-other-services-when-embedded-as-third-party.json'

const frames = process.argv[3]
  ? JSON.parse(readFileSync(process.argv[3], 'utf8'))
  : await (await fetch(FRAMES_SOURCE)).json()

const tail = `
/*
 * Servizi che, dentro un riquadro su un altro sito, chiedono le credenziali
 * di un servizio terzo. Da apple/password-manager-resources
 * (quirks/websites-that-ask-for-credentials-for-other-services-when-embedded-as-third-party.json,
 * licenza MIT, vedi NOTICE.md).
 *
 * Cosa c'entra con noi. Il nostro script gira in tutti i riquadri e legge il
 * nome dell'host del riquadro, non della pagina. Nel riquadro di Plaid dentro
 * il sito di una banca finivamo quindi per proporre un alias e registrarlo su
 * plaid.com, mentre l'account e' della banca: un indirizzo attribuito a un
 * posto in cui non verra' mai usato. Qui non offriamo e non registriamo
 * niente: in questi riquadri si stanno collegando conti correnti, e un
 * suggerimento nostro sarebbe fuori posto anche a prescindere dall'etichetta
 * sbagliata.
 */
export const THIRD_PARTY_CREDENTIAL_FRAMES = new Set(${JSON.stringify([...frames].map((d) => d.toLowerCase()).sort())})

/** Siamo dentro il riquadro di un servizio che chiede credenziali altrui? */
export function isThirdPartyCredentialFrame(domain, inFrame) {
  if (!inFrame || typeof domain !== 'string') return false

  return THIRD_PARTY_CREDENTIAL_FRAMES.has(domain.toLowerCase())
}
`

writeFileSync(new URL('../src/shared/related-sites.js', import.meta.url), file + tail)
console.log(
  `${Object.keys(index).length} domini, ${groups.length} gruppi, ${Object.keys(directed).length} legami diretti`
)
