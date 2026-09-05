/**
 * Collegamento dell'estensione a un account, senza copiare chiavi a mano.
 *
 * ## Com'era, e perché non va bene
 *
 * addy.io fa aprire all'utente il pannello API, creare un token, copiarlo e
 * incollarlo. Sono sei passaggi, e alla fine c'è una chiave piena, che apre
 * l'intero account, passata per gli appunti di sistema, dove la legge
 * chiunque.
 *
 * SimpleLogin e Firefox Relay fanno meglio: una pagina sul loro dominio
 * consegna la chiave all'estensione usando il cookie di sessione. È comodo, ma
 * richiede all'estensione il permesso di leggere le pagine di quel dominio, e
 * la chiave che ne esce è comunque piena.
 *
 * ## Come funziona qui
 *
 * È la forma del device authorization grant (RFC 8628), quello dei televisori.
 *
 *   1. l'estensione apre una richiesta e riceve un segreto lungo;
 *   2. apre la pagina di approvazione su Skudo, dove l'utente è già dentro;
 *   3. l'utente approva;
 *   4. l'estensione presenta il segreto e ritira un token **ristretto**.
 *
 * Niente URL di ritorno da validare (su Gecko cambia a ogni installazione),
 * niente permessi sui siti, niente chiave negli appunti. E il token che ne esce
 * può creare e leggere alias, non toccare l'account.
 *
 * ## Cosa questo schema non ferma
 *
 * Aprire una richiesta non richiede di essere nessuno, quindi qualcuno può
 * aprirne una sua e convincere la vittima ad approvarla con un link mandato
 * per email: la vittima vedrebbe una pagina autentica, sul dominio autentico,
 * mentre è già dentro.
 *
 * C'era un codice da confrontare fra questa pagina e quella di approvazione,
 * che chiudeva la strada; è stato rimosso perché il passo di attenzione
 * costava più di quanto rendesse. Restano a difesa la durata di due minuti, il
 * segreto spendibile una volta sola, e il fatto che il token che ne esce può
 * creare e leggere alias e nient'altro: chi riuscisse nell'inganno non
 * arriverebbe comunque all'account.
 *
 */

/** Dove sta il segreto mentre la richiesta è aperta. */
const SECRET_KEY = 'pendingPairingSecret'

/**
 * Una descrizione leggibile di questo browser, da mostrare a chi approva.
 *
 * Approvare qualcosa senza sapere cosa non è approvare. Niente libreria: qui
 * bastano il nome del motore e quello del sistema, e sbagliarli non fa danno
 * perché il testo è informativo, non una verifica.
 */
export function describeBrowser(userAgent = navigator.userAgent) {
  const browser = /Firefox\//.test(userAgent)
    ? 'Firefox'
    : /Edg\//.test(userAgent)
      ? 'Edge'
      : /OPR\//.test(userAgent)
        ? 'Opera'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'A browser'

  const platform = /Windows/.test(userAgent)
    ? 'Windows'
    : /Macintosh|Mac OS/.test(userAgent)
      ? 'macOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Linux/.test(userAgent)
          ? 'Linux'
          : null

  return platform ? `${browser} on ${platform}` : browser
}

/**
 * Dove tenere il segreto mentre la richiesta è aperta.
 *
 * `storage.session` sta in memoria e non tocca il disco: un segreto che vive
 * due minuti non ha nessun motivo di sopravvivere alla chiusura del browser, e
 * scriverlo lascerebbe in giro qualcosa che non serve più a nessuno. Dove non
 * c'è (motori più vecchi del previsto) si ripiega su `local`, cancellandolo
 * comunque appena speso.
 */
function store(api) {
  return api.storage.session ?? api.storage.local
}

export async function rememberSecret(api, secret) {
  await store(api).set({ [SECRET_KEY]: secret })
}

export async function readSecret(api) {
  const { [SECRET_KEY]: secret } = await store(api).get({ [SECRET_KEY]: '' })
  return secret
}

export async function forgetSecret(api) {
  await store(api).remove(SECRET_KEY)
}
