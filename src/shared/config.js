/**
 * Costanti fissate al momento della costruzione.
 *
 * ## Perché l'indirizzo del server non è un'impostazione
 *
 * Lo era, ed era un errore. Un campo "Server" nella schermata di collegamento
 * sembra un servizio all'utente e invece è tre cose insieme: un modo per
 * sbagliare a digitare, una domanda a cui il novantanove per cento delle
 * persone non sa rispondere, e — la parte che conta — un posto dove chiunque
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
