import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { menuPosition, menuWidth } from '../src/content/anchor.js'

const rect = (top, height = 40, left = 20, width = 240) => ({
  top,
  bottom: top + height,
  left,
  right: left + width,
  width,
  height,
})

describe('il menu sul telefono', () => {
  let viewport

  beforeEach(() => {
    viewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 390, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
  })

  afterEach(() => {
    if (viewport) Object.defineProperty(window, 'visualViewport', viewport)
    else delete window.visualViewport
  })

  const keyboard = (height) =>
    Object.defineProperty(window, 'visualViewport', {
      value: { offsetTop: 0, height },
      configurable: true,
    })

  it('sta sotto il campo quando c e posto', () => {
    keyboard(800)
    expect(menuPosition(rect(100), 160).top).toBe(145)
  })

  it('va sopra il campo quando la tastiera si mangia lo spazio sotto', () => {
    // Vista visibile alta 420: la tastiera copre il resto, il campo e' a 330.
    keyboard(420)
    const { top } = menuPosition(rect(330), 160)
    expect(top).toBeLessThan(330)
    expect(top).toBe(330 - 165)
  })

  it('non esce mai dal bordo destro dello schermo', () => {
    keyboard(800)
    const { left } = menuPosition(rect(100, 40, 300, 80), 160)
    expect(left + menuWidth()).toBeLessThanOrEqual(390 - 8)
  })
})
