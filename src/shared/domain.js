/**
 * Che cosa e' "il sito", per noi.
 *
 * Serve a due cose diverse che devono dare la stessa risposta: l'alias si lega
 * al sito su cui e' nato, e l'icona si va a prendere con il nome di quel sito.
 * Se le due strade calcolassero il dominio in due modi, un alias creato su
 * `accounts.example.com` mostrerebbe l'icona di `accounts.example.com` mentre
 * quello creato su `example.com` ne mostrerebbe un'altra, e sarebbero lo stesso
 * posto.
 *
 * ## Perche' non c'e' la Public Suffix List intera
 *
 * Sono circa 240 KB di elenco, aggiornato di continuo, per un pacchetto che
 * oggi ne pesa 396. L'estensione di addy.io lo fa, e paga quel peso su ogni
 * pagina che apre.
 *
 * Quello che ci serve dalla lista e' molto meno: sapere che `co.uk` non e' un
 * dominio registrabile ma un suffisso. Le eccezioni che contano sono qualche
 * centinaio, riportate qui sotto, e coprono i suffissi a due livelli dei paesi
 * piu' diffusi. Sbagliare su un suffisso esotico non rompe niente: si finisce
 * con un dominio piu' lungo del dovuto, cioe' `example.qc.ca` invece di
 * `qc.ca`, che come identita' del sito e' comunque giusta. Il caso opposto,
 * trattare `co.uk` come dominio, sarebbe invece grave: metterebbe nello stesso
 * gruppo tutti i siti britannici.
 *
 * ## I suffissi privati
 *
 * `github.io`, `vercel.app` e simili ospitano un sito diverso per ogni
 * sottodominio. Trattarli come suffissi e' la differenza fra "il tuo alias per
 * il sito di Tizio" e "il tuo alias per GitHub Pages".
 */

/**
 * I suffissi sotto cui si registra, non che si registrano.
 *
 * @type {Set<string>}
 */
const SUFFIXES = new Set(
  `ac.at ac.be ac.cn ac.cr ac.cy ac.id ac.il ac.in ac.jp ac.kr ac.nz ac.rs ac.th ac.uk ac.za
   adm.br adv.br
   art.br
   asn.au
   biz.pl biz.tr
   co.ao co.at co.bw co.ck co.cr co.id co.il co.in co.jp co.ke co.kr co.ls co.ma co.mz co.nl
   co.nz co.rs co.th co.tz co.ug co.uk co.uz co.ve co.vi co.za co.zm co.zw
   com.ar com.au com.bd com.bh com.bo com.br com.bz com.cn com.co com.cu com.cy com.do com.ec
   com.eg com.es com.et com.fj com.gh com.gt com.hk com.hn com.hr com.jo com.kh com.kw com.lb
   com.lv com.ly com.mm com.mt com.mx com.my com.na com.ng com.ni com.om com.pa com.pe com.pg
   com.ph com.pk com.pl com.pr com.py com.qa com.sa com.sb com.sg com.sv com.tn com.tr com.tw
   com.ua com.uy com.vc com.ve com.vn
   edu.au edu.br edu.cn edu.hk edu.in edu.mx edu.my edu.pl edu.sg edu.tr edu.ua
   eng.br
   esp.br
   firm.in
   gen.in
   go.id go.jp go.kr go.th
   gob.ar gob.cl gob.es gob.mx gob.pe
   gov.au gov.br gov.cn gov.hk gov.il gov.in gov.it gov.pl gov.sg gov.tr gov.uk gov.za
   gv.at
   ind.br ind.in
   inf.br
   info.pl
   jus.br
   lg.jp
   ltd.uk
   me.uk
   mil.br
   ne.jp ne.kr
   net.au net.br net.cn net.hk net.il net.in net.mx net.my net.nz net.pl net.sa net.sg net.tr
   net.ua net.uk net.ve
   nhs.uk
   nom.br
   ac.ma or.at or.jp or.kr or.th
   org.au org.br org.cn org.es org.hk org.il org.in org.mx org.my org.nz org.pl org.ru org.sg
   org.tr org.ua org.uk org.ve org.za
   plc.uk
   psi.br
   sch.uk
   sc.ke
   web.id
   appspot.com azurewebsites.net cloudfront.net elasticbeanstalk.com
   fastly.net firebaseapp.com fly.dev github.io gitlab.io glitch.me herokuapp.com
   my.id netlify.app netlify.com now.sh onrender.com pages.dev
   r2.dev repl.co s3.amazonaws.com surge.sh vercel.app web.app workers.dev`
    .split(/\s+/)
    .filter(Boolean)
)

/** L'host di un indirizzo, senza `www`, oppure stringa vuota. */
export function hostFromUrl(url) {
  try {
    const { protocol, hostname } = new URL(url)
    // Solo i siti veri: `about:`, `moz-extension:`, `file:` e i loro parenti
    // non sono posti dove ci si registra.
    if (protocol !== 'https:' && protocol !== 'http:') return ''
    return hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Il dominio a cui il sito appartiene davvero.
 *
 * `shop.example.co.uk` sta sotto `example.co.uk`; `tizio.github.io` e' un sito
 * suo. Restituisce stringa vuota per tutto quello che non e' un nome di
 * dominio, indirizzi IP compresi: da li' non si ricava nessuna identita' utile,
 * e mandarli al server significherebbe solo farsi rifiutare.
 */
export function registrableDomain(host) {
  if (typeof host !== 'string') return ''

  const clean = host.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '')

  if (!clean || clean.length > 253) return ''
  if (!/^[a-z0-9.-]+$/.test(clean)) return ''
  // Un indirizzo IPv4 supera il controllo dei caratteri: si esclude a parte.
  if (/^\d+(\.\d+)*$/.test(clean)) return ''

  const labels = clean.split('.')
  if (labels.length < 2) return ''
  if (labels.some((label) => !label || label.length > 63)) return ''
  if (labels.some((label) => label.startsWith('-') || label.endsWith('-'))) return ''

  const tld = labels[labels.length - 1]
  if (tld.length < 2 || !/^[a-z]+$/.test(tld)) return ''

  // Tre livelli sono il massimo che serve: nessun suffisso nell'elenco ne ha
  // di piu'.
  const twoLevel = labels.slice(-2).join('.')

  if (labels.length > 2 && SUFFIXES.has(twoLevel)) {
    return labels.slice(-3).join('.')
  }

  return twoLevel
}

/**
 * L'impronta con cui si chiede l'icona di un dominio.
 *
 * SHA-256, uguale a quella che calcola il server (App\Support\SiteDomain).
 * Non e' un segreto: il procedimento sta dentro l'estensione, che chiunque puo'
 * leggere. Serve a un'altra cosa, cioe' a non avere da nessuna parte una
 * colonna con l'elenco in chiaro dei domini che le persone visitano.
 */
export async function iconHash(registrable) {
  const bytes = new TextEncoder().encode(registrable)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** L'host e il suo dominio registrabile in un colpo, da un URL. */
export function siteFromUrl(url) {
  const host = hostFromUrl(url)
  const root = registrableDomain(host)
  return root ? { host, root } : { host: '', root: '' }
}
