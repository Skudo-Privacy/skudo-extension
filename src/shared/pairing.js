/**
 * Collegamento dell'estensione a un account, senza copiare chiavi a mano.
 *
 * ## Com'era, e perché non va bene
 *
 * addy.io fa aprire all'utente il pannello API, creare un token, copiarlo e
 * incollarlo. Sono sei passaggi, e alla fine c'è una chiave piena — che apre
 * l'intero account — passata per gli appunti di sistema, dove la legge
 * chiunque.
 *
 * SimpleLogin e Firefox Relay fanno meglio: una pagina sul loro dominio
 * consegna la chiave all'estensione usando il cookie di sessione. È comodo, ma
 * richiede all'estensione il permesso di leggere le pagine di quel dominio, e
 * la chiave che ne esce è comunque piena.
 *
 * ## Come funziona qui
 *
 * È la forma del device authorization grant (RFC 8628), quello dei televisori,
 * con l'aggiunta del confronto di un codice.
 *
 *   1. l'estensione apre una richiesta e riceve un segreto lungo;
 *   2. mostra quattro caratteri e apre la pagina di approvazione su Skudo;
 *   3. l'utente controlla che i quattro caratteri combacino e approva;
 *   4. l'estensione presenta il segreto e ritira un token **ristretto**.
 *
 * Niente URL di ritorno da validare (su Gecko cambia a ogni installazione),
 * niente permessi sui siti, niente chiave negli appunti. E il token che ne esce
 * può creare e leggere alias, non toccare l'account.
 *
 * ## I quattro caratteri
 *
 * Sono l'unica difesa contro l'attacco vero a questo schema: aprire una
 * richiesta propria e convincere la vittima ad approvarla con un link mandato
 * per email. La vittima vedrebbe una pagina autentica, sul dominio autentico,
 * mentre è già dentro. Se il codice sulla pagina non è quello che l'estensione
 * ha appena mostrato, la richiesta non è partita da lì.
 *
 * Per questo il codice va mostrato dove resta visibile mentre l'utente guarda
 * un'altra scheda, cioè in una pagina dell'estensione e non nel popup, che si
 * chiude appena si cambia finestra.
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
