import { afterEach, describe, expect, it } from 'vitest'
import { exclusionReason } from '../../src/detector/exclusions.js'
import { findEmailFields } from '../../src/detector/index.js'
import { cleanup, env, envWith, mount } from '../helpers.js'

afterEach(cleanup)

/**
 * Lo strato di esclusione è quello che protegge le pagine degli altri. Un alias
 * finito in una casella di ricerca o in un campo "codice sconto" non è un
 * rilevamento mancato: è la nostra estensione che rompe un sito.
 */
describe('esclusioni', () => {
  const cases = [
    [
      'casella di ricerca che filtra per email',
      '<input type="text" name="search_email" placeholder="Search by email">',
    ],
    ['filtro di una tabella', '<input type="text" name="email" placeholder="Filter emails">'],
    [
      'oggetto di un modulo di contatto',
      '<input type="text" name="email_subject" placeholder="Subject">',
    ],
    ['codice sconto', '<input type="text" name="promo_code" placeholder="Discount code">'],
    ['codice di verifica', '<input type="text" name="otp_code" placeholder="Verification code">'],
    ['campo trappola', '<input type="text" name="email_honeypot" autocomplete="off">'],
    ['campo disabilitato', '<input type="email" name="email" disabled>'],
    ['campo in sola lettura', '<input type="email" name="email" readonly>'],
    ['password', '<input type="password" name="email">'],
    ['telefono', '<input type="tel" name="email_or_phone">'],
    ['ricerca dichiarata via ruolo', '<input type="text" name="email" role="search">'],
  ]

  for (const [description, html] of cases) {
    it(`scarta: ${description}`, () => {
      const container = mount(html)
      const input = container.querySelector('input')
      expect(exclusionReason(input)).not.toBeNull()
      expect(findEmailFields(container, { env })).toHaveLength(0)
    })
  }

  it('non scarta per autocomplete="off", che mezzo web mette per abitudine', () => {
    const container = mount('<input type="email" name="email" autocomplete="off">')
    expect(exclusionReason(container.querySelector('input'))).toBeNull()
  })

  it('scarta un campo email dentro una form di ricerca', () => {
    const container = mount(`
      <form role="search">
        <input type="text" name="email" placeholder="Email">
      </form>
    `)
    expect(findEmailFields(container, { env })).toHaveLength(0)
  })
})

describe('sanità fisica', () => {
  it('scarta un campo trappola largo un pixel', () => {
    const container = mount(
      '<form><input type="email" name="email"><button>Sign up</button></form>'
    )
    const input = container.querySelector('input')
    const tinyEnv = envWith([[input, { width: 1, height: 1 }]])
    expect(findEmailFields(container, { env: tinyEnv })).toHaveLength(0)
  })

  it('scarta un campo nascosto', () => {
    const container = mount('<input type="email" name="email" style="display:none">')
    expect(findEmailFields(container, { env })).toHaveLength(0)
  })
})
