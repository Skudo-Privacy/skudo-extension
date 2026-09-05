import { createFakeEnv } from '../src/detector/env.js'

/**
 * Monta un frammento di HTML e restituisce il contenitore.
 *
 * La geometria arriva da un ambiente finto: in un DOM simulato
 * `getBoundingClientRect()` restituisce zeri per tutto, quindi senza questo il
 * controllo di dimensione minima scarterebbe ogni campo e i test non
 * proverebbero niente.
 */
export function mount(html) {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  return container
}

export function cleanup() {
  document.body.innerHTML = ''
}

/**
 * @param {Array<[Element, object]>} overrides  geometria per singoli elementi
 */
export function envWith(overrides = []) {
  return createFakeEnv({ rects: new Map(overrides) })
}

export const env = createFakeEnv()
