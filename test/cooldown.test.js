import { describe, expect, it } from 'vitest'

import {
  BURST,
  BURST_GAP_MS,
  EMPTY,
  GAP_MS,
  WINDOW_MS,
  afterCreate,
  describe as describeWait,
  ready,
  readyAt,
  remaining,
  secondsLeft,
} from '../src/shared/cooldown.js'

/**
 * Il freno sulla creazione.
 *
 * Le soglie sono replicate lato server (App\Support\TokenAbilities): queste
 * prove tengono ferma la metà che l'utente vede, cioè quella che deve dire un
 * numero giusto mentre aspetta.
 */
describe('il freno sulla creazione', () => {
  const now = 1_700_000_000_000

  it('il primo alias non aspetta niente', () => {
    expect(ready(EMPTY, now)).toBe(true)
    expect(remaining(EMPTY, now)).toBe(0)
    expect(describeWait(EMPTY, now)).toBe('')
  })

  it('fra uno e il successivo passano sette secondi', () => {
    const state = afterCreate(EMPTY, now)

    expect(remaining(state, now)).toBe(GAP_MS)
    expect(ready(state, now + GAP_MS - 1)).toBe(false)
    expect(ready(state, now + GAP_MS)).toBe(true)
  })

  it('dopo il terzo di fila la pausa è più lunga', () => {
    let state = EMPTY
    let clock = now

    for (let i = 0; i < BURST; i++) {
      state = afterCreate(state, clock)
      clock += GAP_MS
    }

    // Il quarto arriva dopo la pausa corta, che ora non basta più.
    expect(ready(state, clock)).toBe(false)
    expect(readyAt(state, clock)).toBe(clock - GAP_MS + BURST_GAP_MS)
  })

  it('dopo la pausa lunga la serie riparte da uno', () => {
    let state = EMPTY
    let clock = now

    for (let i = 0; i < BURST; i++) {
      state = afterCreate(state, clock)
      clock += GAP_MS
    }

    clock += BURST_GAP_MS
    state = afterCreate(state, clock)

    // Se ripartisse da quattro, ogni alias successivo pagherebbe per sempre la
    // pausa lunga.
    expect(remaining(state, clock)).toBe(GAP_MS)
  })

  it('un silenzio lungo azzera la serie', () => {
    let state = EMPTY
    let clock = now

    for (let i = 0; i < BURST; i++) {
      state = afterCreate(state, clock)
      clock += GAP_MS
    }

    // Tre alias creati in un pomeriggio non sono una raffica.
    expect(ready(state, clock + WINDOW_MS)).toBe(true)
    expect(remaining(afterCreate(state, clock + WINDOW_MS), clock + WINDOW_MS)).toBe(GAP_MS)
  })

  it('i secondi si arrotondano per eccesso', () => {
    const state = afterCreate(EMPTY, now)

    // Un bottone che dice "fra 0 secondi" ed è ancora spento ha appena mentito.
    expect(secondsLeft(state, now + GAP_MS - 1)).toBe(1)
    expect(secondsLeft(state, now + GAP_MS)).toBe(0)
  })

  it("la frase dice anche perché, quando l'attesa è lunga", () => {
    let state = EMPTY
    let clock = now

    for (let i = 0; i < BURST; i++) {
      state = afterCreate(state, clock)
      clock += GAP_MS
    }

    expect(describeWait(state, clock)).toContain('Three in a row')
    expect(describeWait(afterCreate(EMPTY, clock), clock)).toBe('Ready in 7s')
  })

  it('uno stato rotto non blocca nessuno', () => {
    // Se `storage` restituisce spazzatura, il freno si apre invece di
    // chiudersi: il limite vero è comunque sul server.
    for (const junk of [null, undefined, {}, { count: 'due' }, { count: -1, at: now }]) {
      expect(ready(junk, now)).toBe(true)
    }
  })
})
