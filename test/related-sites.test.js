import { describe, expect, it } from 'vitest'
import {
  GROUPS,
  INDEX,
  isThirdPartyCredentialFrame,
  relatedSites,
} from '../src/shared/related-sites.js'

describe('i siti che condividono un account', () => {
  it('un gruppo simmetrico si legge da qualunque dei suoi domini', () => {
    // Quindici insegne di supermercato, un login solo.
    expect(relatedSites('vons.com')).toContain('safeway.com')
    expect(relatedSites('safeway.com')).toContain('vons.com')
  })

  it('non restituisce mai se stesso', () => {
    for (const domain of ['vons.com', 'airbnb.it', 'envato.com']) {
      expect(relatedSites(domain)).not.toContain(domain)
    }
  })

  it('un legame a senso unico resta a senso unico', () => {
    // Da a2hosting.com si finisce su hosting.com. Il contrario no: chi ha un
    // account su hosting.com non ha necessariamente mai visto a2hosting, e
    // proporgli quell'alias sarebbe un indirizzo comparso dal nulla.
    expect(relatedSites('a2hosting.com')).toContain('hosting.com')
    expect(relatedSites('hosting.com')).not.toContain('a2hosting.com')
  })

  it('un dominio sconosciuto non ha parenti', () => {
    expect(relatedSites('example.com')).toEqual([])
    expect(relatedSites('')).toEqual([])
    expect(relatedSites(undefined)).toEqual([])
  })

  it('nessun gruppo supera il tetto che il server accetta', () => {
    // App\\Rules\\ValidSiteDomainList::MAX_DOMAINS. Un gruppo piu' lungo
    // verrebbe troncato, e un troncamento fa sparire proprio l'alias che si
    // sta cercando senza dire perche'.
    const longest = Math.max(...GROUPS.map((group) => group.length))
    expect(longest).toBeLessThanOrEqual(60)
  })

  it('l indice punta sempre a un gruppo che contiene quel dominio', () => {
    for (const [domain, at] of Object.entries(INDEX)) {
      expect(GROUPS[at]).toContain(domain)
    }
  })
})

describe('i riquadri che chiedono credenziali altrui', () => {
  it('dentro un riquadro di Plaid non si fa niente', () => {
    expect(isThirdPartyCredentialFrame('plaid.com', true)).toBe(true)
  })

  it('sul sito di Plaid, in cima, si lavora normalmente', () => {
    // Chi si registra su plaid.com sta davvero creando un account Plaid.
    expect(isThirdPartyCredentialFrame('plaid.com', false)).toBe(false)
  })

  it('un riquadro qualunque non e uno di quelli', () => {
    expect(isThirdPartyCredentialFrame('example.com', true)).toBe(false)
    expect(isThirdPartyCredentialFrame('', true)).toBe(false)
  })
})
