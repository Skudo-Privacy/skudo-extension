import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createFakeEnv } from '../../src/detector/env.js'
import { explainRoot, findEmailFields } from '../../src/detector/index.js'
import { cleanup, mount } from '../helpers.js'

/**
 * Corpus di moduli reali.
 *
 * Questa è la parte che tiene in piedi tutto il resto. Le euristiche di
 * rilevamento peggiorano da sole: si aggiunge un'esclusione per sistemare un
 * sito e se ne rompono due che nessuno riprova. Senza un corpus che gira a ogni
 * modifica, il motore degrada e ce ne accorgiamo dalle segnalazioni.
 *
 * Nessuna delle estensioni per alias che abbiamo esaminato (addy.io,
 * SimpleLogin, Firefox Relay) ha test di rilevamento.
 *
 * ## Stato dichiarato
 *
 * I moduli qui dentro sono scritti a mano sui modelli ricorrenti del web
 * (accesso con nome utente o email, cassa di negozio, iscrizione senza <form>,
 * newsletter nel piede, coppia con conferma, widget in shadow DOM), non sono
 * catture di siti veri. Sono rappresentativi, non un campione.
 *
 * Vanno sostituiti con catture reali prima di considerare calibrati i pesi
 * marcati `calibrated: false` in signals.js. Per aggiungerne una: salvare
 * l'HTML qui e aggiungere la voce in expectations.json.
 */

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const expectations = JSON.parse(readFileSync(join(fixturesDir, 'expectations.json'), 'utf8'))

afterEach(cleanup)

/** Ogni file .html deve avere una voce di attesa, altrimenti non prova niente. */
const files = readdirSync(fixturesDir).filter((name) => name.endsWith('.html'))

describe('corpus', () => {
  it('ogni modulo del corpus ha le sue attese', () => {
    expect(files.sort()).toEqual(Object.keys(expectations).sort())
  })

  for (const file of files) {
    const expected = expectations[file]

    it(`${file}: ${expected.why}`, () => {
      const container = mount(readFileSync(join(fixturesDir, file), 'utf8'))

      // Alcuni moduli vivono in una shadow root: il template va montato prima.
      if (expected.shadowHost) {
        const host = container.querySelector(expected.shadowHost)
        const template = container.querySelector(expected.shadowTemplate)
        host.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true))
      }

      // La geometria misurata, dove conta: un honeypot spinto a -9999px si
      // riconosce solo così, e in un DOM simulato non c'è disposizione.
      const rects = new Map()
      for (const [selector, rect] of Object.entries(expected.geometry || {})) {
        const el = container.querySelector(selector)
        expect(el, `geometria per un selettore che non esiste: ${selector}`).not.toBeNull()
        rects.set(el, rect)
      }
      const env = createFakeEnv({ rects })

      const found = findEmailFields(container, { env })

      const describeFound = () =>
        JSON.stringify(
          explainRoot(container, { env }).map((r) => ({
            name: r.element.getAttribute('name') || r.element.id,
            rejected: r.rejected,
            action: r.action,
          })),
          null,
          2
        )

      expect(found.length, `campi trovati:\n${describeFound()}`).toBe(expected.fields.length)

      expected.fields.forEach((want, index) => {
        const got = found[index]
        const target = (expected.shadowHost ? container.querySelector(expected.shadowHost).shadowRoot : container)
          .querySelector(want.selector)

        expect(got.element, `campo ${index} sbagliato in ${file}`).toBe(target)
        expect(got.action, `azione sul campo ${index} in ${file}`).toBe(want.action)
        if (want.intent) {
          expect(got.formIntent, `intento del modulo per il campo ${index} in ${file}`).toBe(want.intent)
        }
      })
    })
  }
})
