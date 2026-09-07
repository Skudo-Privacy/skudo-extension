/**
 * Costanti fissate al momento della costruzione.
 *
 * ## Perché l'indirizzo del server non è un'impostazione
 *
 * Lo era, ed era un errore. Un campo "Server" nella schermata di collegamento
 * sembra un servizio all'utente e invece è tre cose insieme: un modo per
 * sbagliare a digitare, una domanda a cui il novantanove per cento delle
 * persone non sa rispondere, e soprattutto un posto dove chiunque
 * riesca a farsi scrivere un indirizzo diverso dirotta l'intero collegamento
 * verso un server suo.
 *
 * Il flusso di autenticazione deve essere uno solo, e deve puntare sempre allo
 * stesso posto. Non c'è niente da scegliere, quindi non si chiede niente.
 *
 * ## Per costruire una versione che punta altrove
 *
 * Non serve un'interfaccia, serve una variabile al momento della costruzione:
 *
 *     SKUDO_INSTANCE=http://localhost:8000 npm run build
 *
 * Il valore finisce dentro il pacchetto e non è più modificabile da lì. Chi si
 * autocolloca costruisce la propria versione, che è quello che sta già facendo
 * con il resto.
 */

/** Il server a cui questa versione parla. Sostituito da esbuild. */
export const INSTANCE = __SKUDO_INSTANCE__.replace(/\/+$/, '')

/**
 * Da dove si prendono le icone dei siti.
 *
 * Un indirizzo a parte, e non `INSTANCE` piu' un percorso, perche' la
 * differenza e' sostanziale: a questo si parla **senza token**. Una richiesta
 * autenticata direbbe "l'utente X ha un alias per il sito Y", cioe'
 * ricostruirebbe lato server la mappa che il resto del sistema esiste per non
 * costruire.
 *
 * Chi distribuisce la propria versione lo punta dove vuole, o lo lascia
 * sull'applicazione: `SKUDO_ICONS_URL=https://static.esempio/icone npm run build`.
 */
export const ICONS_URL = __SKUDO_ICONS__.replace(/\/+$/, '')
