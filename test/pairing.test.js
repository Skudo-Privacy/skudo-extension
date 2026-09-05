import { describe, expect, it } from 'vitest'
import { describeBrowser } from '../src/shared/pairing.js'

/**
 * L'etichetta finisce sulla pagina di approvazione, sotto "Requested by".
 * Approvare qualcosa senza sapere cosa non è approvare, quindi deve essere
 * leggibile anche quando non riconosciamo il browser.
 */
describe('descrizione del browser', () => {
  const cases = [
    ['Firefox on Linux', 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0'],
    [
      'Firefox on Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0',
    ],
    [
      'Chrome on macOS',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    ],
    [
      'Edge on Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0',
    ],
  ]

  for (const [expected, userAgent] of cases) {
    it(`riconosce ${expected}`, () => {
      expect(describeBrowser(userAgent)).toBe(expected)
    })
  }

  it('riconosce Mullvad Browser come Firefox, che è quello che è', () => {
    // Mullvad Browser e LibreWolf non si annunciano: si presentano come
    // Firefox, di proposito, perché farsi riconoscere è il problema che
    // cercano di risolvere. Non tentiamo di smascherarli.
    expect(
      describeBrowser('Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0')
    ).toBe('Firefox on Windows')
  })

  it('resta leggibile davanti a qualcosa che non conosce', () => {
    expect(describeBrowser('Something/1.0')).toBe('A browser')
  })
})
