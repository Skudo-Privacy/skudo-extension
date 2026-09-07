import { describe, expect, it } from 'vitest'

import { hostFromUrl, iconHash, registrableDomain, siteFromUrl } from '../src/shared/domain.js'

/**
 * Il dominio del sito, che è la chiave di tutto il resto.
 *
 * Se questa funzione dà due risposte diverse per due indirizzi dello stesso
 * posto, l'alias creato su `accounts.esempio.com` non viene più riconosciuto su
 * `esempio.com`, e l'utente si ritrova due indirizzi per un'iscrizione sola.
 */
describe('il dominio registrabile', () => {
  it('toglie i sottodomini', () => {
    expect(registrableDomain('accounts.google.com')).toBe('google.com')
    expect(registrableDomain('a.b.c.example.com')).toBe('example.com')
  })

  it('conosce i suffissi a due livelli', () => {
    // Senza questo, tutti i siti britannici finirebbero nello stesso gruppo.
    expect(registrableDomain('shop.example.co.uk')).toBe('example.co.uk')
    expect(registrableDomain('example.co.uk')).toBe('example.co.uk')
    expect(registrableDomain('www.bbc.co.uk')).toBe('bbc.co.uk')
    expect(registrableDomain('tienda.example.com.ar')).toBe('example.com.ar')
  })

  it('tratta gli ospiti di sottodomini come siti a sé', () => {
    // `tizio.github.io` e `caio.github.io` sono due persone diverse.
    expect(registrableDomain('tizio.github.io')).toBe('tizio.github.io')
    expect(registrableDomain('qualcosa.vercel.app')).toBe('qualcosa.vercel.app')
  })

  it('non si fa passare per dominio quello che non lo è', () => {
    for (const bad of [
      '127.0.0.1',
      '::1',
      'localhost',
      '',
      'example.com:8080',
      'https://example.com',
      'esempio .com',
      'example.123',
      '-example.com',
      'example-.com',
      'example..com',
    ]) {
      expect(registrableDomain(bad)).toBe('')
    }
  })

  it('legge un URL solo se è di un sito vero', () => {
    expect(hostFromUrl('https://www.example.com/signup')).toBe('example.com')
    expect(hostFromUrl('about:newtab')).toBe('')
    expect(hostFromUrl('moz-extension://abc/popup.html')).toBe('')
    expect(hostFromUrl('file:///home/x/index.html')).toBe('')
    expect(hostFromUrl('non è un url')).toBe('')
  })

  it('restituisce host e radice insieme', () => {
    expect(siteFromUrl('https://accounts.example.co.uk/login')).toEqual({
      host: 'accounts.example.co.uk',
      root: 'example.co.uk',
    })
    expect(siteFromUrl('about:blank')).toEqual({ host: '', root: '' })
  })

  it("l'impronta è stabile e non dice niente", async () => {
    const hash = await iconHash('example.com')

    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(await iconHash('example.com')).toBe(hash)
    expect(await iconHash('example.org')).not.toBe(hash)
    // Il valore è fissato qui perché il server calcola lo stesso: se cambia da
    // una parte sola, le icone smettono di essere trovate e nessuno capisce
    // perché.
    expect(hash).toBe('a379a6f6eeafb9a55e378c118034e2751e682fab9f2d30ab13d2125586ce1947')
  })
})
