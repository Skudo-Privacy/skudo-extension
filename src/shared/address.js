/**
 * Un indirizzo, scritto come si legge.
 *
 * La parte locale e' quella che distingue un alias da un altro; il dominio e'
 * uguale per tutti i propri alias e, in un elenco, e' rumore. Scriverli con due
 * pesi diversi non e' un vezzo tipografico: e' quello che permette di scorrere
 * una colonna di indirizzi trovando subito quello che si cerca, invece di
 * leggere venti volte `@skudo.me`.
 *
 * Sta qui e non dentro il pannello perche' vale in tutti e due i posti in cui
 * un indirizzo compare, e due implementazioni della stessa idea divergono.
 */
export function addressNode(email, className = 'address__text') {
  const wrap = document.createElement('span')
  wrap.className = className

  const at = email.lastIndexOf('@')

  const local = document.createElement('span')
  local.className = 'address__local'
  local.textContent = at === -1 ? email : email.slice(0, at)
  wrap.appendChild(local)

  if (at !== -1) {
    const domain = document.createElement('span')
    domain.className = 'address__domain'
    domain.textContent = email.slice(at)
    wrap.appendChild(domain)
  }

  return wrap
}
