import { afterEach, describe, expect, it } from 'vitest'
import { findEmailFields } from '../../src/detector/index.js'
import { cleanup, env, mount } from '../helpers.js'

afterEach(cleanup)

const signup = (fields) => `
  <form id="registration">
    ${fields}
    <input type="password" name="password" autocomplete="new-password">
    <button type="submit">Create account</button>
  </form>
`

function detectOne(html) {
  const container = mount(html)
  const fields = findEmailFields(container, { env })
  return fields[0] || null
}

describe('strato 1: quando il sito ce lo dice', () => {
  it('riconosce type="email" senza bisogno di punteggio', () => {
    const field = detectOne(signup('<input type="email" name="whatever_1234">'))
    expect(field?.confidence).toBe('certain')
    expect(field?.score).toBe(1)
  })

  it('riconosce autocomplete="email" su un campo di testo', () => {
    const field = detectOne(signup('<input type="text" name="x" autocomplete="email">'))
    expect(field?.confidence).toBe('certain')
  })
})

describe('strato 2: punteggio sui segnali', () => {
  it('riconosce un campo dalla sola <label> associata', () => {
    // Il caso che il modello di Mozilla ha mostrato essere il più informativo:
    // l'input non dice niente di sé, l'etichetta dice tutto.
    const field = detectOne(
      signup('<label for="f1">Email address</label><input type="text" id="f1" name="f1">')
    )
    expect(field).not.toBeNull()
    expect(field.signals).toContain('labelMatchesEmail')
  })

  it('riconosce una <label> che punta al name invece che all\'id', () => {
    // Errore di scrittura frequente: `for` dovrebbe puntare all'`id`. Il campo
    // resta un campo email anche se chi l'ha scritto ha sbagliato.
    const field = detectOne(
      signup('<label for="usermail">Your e-mail</label><input type="text" id="x9" name="usermail">')
    )
    expect(field).not.toBeNull()
  })

  it('riconosce una <label> che avvolge il campo, senza for', () => {
    const field = detectOne(signup('<label>Email<input type="text" name="q"></label>'))
    expect(field).not.toBeNull()
  })

  it('riconosce name="customer_email" pur non essendo una corrispondenza esatta', () => {
    const field = detectOne(signup('<input type="text" name="customer_email">'))
    expect(field?.signals).toContain('attrsContainEmail')
  })

  it('riconosce il testo vicino quando non c\'è nessuna label', () => {
    const field = detectOne(signup('<div><span>Email</span><input type="text" name="c1"></div>'))
    expect(field?.signals).toContain('nearbyTextMatchesEmail')
  })

  it('non si accende su una frase lunga che nomina la email', () => {
    // "Non condivideremo mai la tua email con nessuno" come placeholder non
    // rende quel campo un campo email.
    const field = detectOne(
      signup('<input type="text" name="c2" placeholder="We will never share your email with anyone, ever">')
    )
    expect(field).toBeNull()
  })

  it('non si accende su un campo anonimo', () => {
    expect(detectOne(signup('<input type="text" name="field_7">'))).toBeNull()
  })
})

describe('shadow DOM', () => {
  it('trova un campo dentro una shadow root aperta', () => {
    const container = mount('<div id="host"></div>')
    const host = container.querySelector('#host')
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<form><input type="email" name="email"><button>Sign up</button></form>'

    const fields = findEmailFields(container, { env })
    expect(fields).toHaveLength(1)
  })

  it('non vede dentro una shadow root chiusa, e non esplode', () => {
    const container = mount('<div id="host"></div>')
    const shadow = container.querySelector('#host').attachShadow({ mode: 'closed' })
    shadow.innerHTML = '<input type="email" name="email">'

    expect(() => findEmailFields(container, { env })).not.toThrow()
    expect(findEmailFields(container, { env })).toHaveLength(0)
  })
})

describe('campo di conferma', () => {
  it('marca "conferma email" come ripetizione, non come alias nuovo', () => {
    const container = mount(
      signup(`
        <label for="e1">Email</label><input type="email" id="e1" name="email">
        <label for="e2">Confirm email</label><input type="email" id="e2" name="email_confirmation">
      `)
    )
    const fields = findEmailFields(container, { env })
    expect(fields).toHaveLength(2)
    expect(fields[0].action).toBe('create')
    expect(fields[1].action).toBe('repeat')
  })
})

describe('autocomplete come sequenza di token', () => {
  // Lo standard prevede prefissi di sezione e di contesto. Trattare
  // l'attributo come un valore unico scarta campi dichiarati correttamente,
  // e lo fa proprio nelle casse dei negozi.
  const valid = ['email', 'shipping email', 'billing email', 'section-work shipping email', 'email webauthn']

  for (const value of valid) {
    it(`riconosce autocomplete="${value}"`, () => {
      const field = detectOne(signup(`<input type="text" name="z" autocomplete="${value}">`))
      expect(field?.confidence).toBe('certain')
    })
  }

  it('continua a scartare un autocomplete che dichiara altro', () => {
    expect(detectOne(signup('<input type="text" name="email" autocomplete="tel">'))).toBeNull()
  })
})
