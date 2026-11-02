import { describe, expect, it } from 'vitest'
import { parseServerTime } from '../src/shared/time.js'

describe('parseServerTime', () => {
  it('reads a zoneless server timestamp as UTC', () => {
    expect(parseServerTime('2026-10-25 14:03:00')).toBe(Date.UTC(2026, 9, 25, 14, 3, 0))
  })
  it('leaves timestamps that carry a zone alone', () => {
    expect(parseServerTime('2026-10-25T14:03:00Z')).toBe(Date.UTC(2026, 9, 25, 14, 3, 0))
    expect(parseServerTime('2026-10-25T16:03:00+02:00')).toBe(Date.UTC(2026, 9, 25, 14, 3, 0))
  })
  it('returns NaN for junk', () => {
    expect(parseServerTime('')).toBeNaN()
    expect(parseServerTime(null)).toBeNaN()
  })
})
