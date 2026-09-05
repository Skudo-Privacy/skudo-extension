import { afterEach, describe, expect, it } from 'vitest'
import { detectFormIntent } from '../../src/detector/form-intent.js'
import { findEmailFields } from '../../src/detector/index.js'
import { cleanup, env, mount } from '../helpers.js'

afterEach(cleanup)

/**
 * È la parte che nessuna estensione per alias fa oggi, e quella per cui vale la
 * pena scrivere questo motore.
 *
 * Su un modulo di accesso un alias nuovo è dannoso: l'utente lo inserisce, non
 * entra, e si ritrova un indirizzo inutile da cancellare. Va invece proposto
 * quello che già possiede per quel dominio.
 */

function intentOf(html) {
  const container = mount(html)
  return detectFormIntent(container.querySelector('input[type=email], input[type=text]'))
}

describe('accesso', () => {
  it('riconosce un accesso classico', () => {
    const { intent } = intentOf(`
      <form action="/login">
        <label for="e">Email</label><input type="email" id="e" name="email">
        <input type="password" name="password" autocomplete="current-password">
        <label><input type="checkbox" name="remember"> Remember me</label>
        <button type="submit">Sign in</button>
        <a href="/forgot">Forgot your password?</a>
      </form>
    `)
    expect(intent).toBe('login')
  })

  it('riconosce un accesso anche senza autocomplete, dal solo pulsante', () => {
    const { intent } = intentOf(`
      <form>
        <input type="email" name="email">
        <input type="password" name="pw">
        <button>Log in</button>
      </form>
    `)
    expect(intent).toBe('login')
  })

  it('propone il riuso invece della creazione', () => {
    const container = mount(`
      <form action="/login">
        <input type="email" name="email">
        <input type="password" name="password" autocomplete="current-password">
        <button>Sign in</button>
      </form>
    `)
    const [field] = findEmailFields(container, { env })
    expect(field.action).toBe('reuse')
  })
})

describe('iscrizione', () => {
  it('riconosce una registrazione con conferma password e termini', () => {
    const { intent } = intentOf(`
      <form action="/register">
        <label for="e">Email address</label><input type="email" id="e" name="email">
        <input type="password" name="password" autocomplete="new-password">
        <input type="password" name="password_confirmation">
        <label><input type="checkbox" name="terms"> I accept the terms and privacy policy</label>
        <button type="submit">Create account</button>
        <a href="/login">Already have an account?</a>
      </form>
    `)
    expect(intent).toBe('signup')
  })

  it('riconosce una newsletter, che è il caso in cui un alias serve di più', () => {
    const { intent } = intentOf(`
      <form>
        <label for="n">Email</label><input type="email" id="n" name="email">
        <button>Subscribe</button>
      </form>
    `)
    expect(intent).toBe('signup')
  })

  it('funziona anche senza <form>, come nei siti a componenti', () => {
    const { intent } = intentOf(`
      <div class="signup-card">
        <label for="e">Email</label><input type="email" id="e" name="email">
        <input type="password" name="password" autocomplete="new-password">
        <button>Sign up</button>
      </div>
    `)
    expect(intent).toBe('signup')
  })
})

describe('ambiguo', () => {
  it('non si sbilancia su un modulo che non dice niente', () => {
    const { intent } = intentOf(`
      <form>
        <input type="email" name="email">
        <input type="password" name="password">
        <button>Continue</button>
      </form>
    `)
    expect(intent).toBe('unknown')
  })

  it('nel dubbio propone comunque un alias nuovo', () => {
    // Non offrirlo su un'iscrizione vera è il fallimento peggiore fra i due.
    const container = mount(`
      <form>
        <input type="email" name="email">
        <input type="password" name="password">
        <button>Continue</button>
      </form>
    `)
    const [field] = findEmailFields(container, { env })
    expect(field.formIntent).toBe('unknown')
    expect(field.action).toBe('create')
  })
})

describe('username come indirizzo', () => {
  it('accetta un campo "username" su un modulo di iscrizione', () => {
    const container = mount(`
      <form action="/register">
        <label for="u">Username</label><input type="text" id="u" name="username" autocomplete="username">
        <input type="password" name="password" autocomplete="new-password">
        <button>Create account</button>
      </form>
    `)
    const fields = findEmailFields(container, { env })
    expect(fields).toHaveLength(0)
  })

  it('accetta "username" quando il modulo lo chiama anche email', () => {
    const container = mount(`
      <form action="/register">
        <label for="u">Email or username</label><input type="text" id="u" name="username" autocomplete="username">
        <input type="password" name="password" autocomplete="new-password">
        <button>Create account</button>
      </form>
    `)
    const fields = findEmailFields(container, { env })
    expect(fields).toHaveLength(1)
  })
})
