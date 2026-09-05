/**
 * Costruzione dell'estensione.
 *
 * esbuild invece di Vite o laravel-mix: servono tre bundle autonomi e la copia
 * di qualche file statico, e questo è tutto. addy.io usa laravel-mix con una
 * versione di webpack inchiodata negli `overrides` per tenerlo insieme; qui la
 * catena di costruzione è questo file.
 *
 * Formato `iife` e non `esm`: un content script registrato con
 * `scripting.registerContentScripts` non è un modulo, e il supporto ai moduli ES
 * nel contesto di sfondo non è uniforme fra Gecko e Chromium. Un bundle
 * autonomo per contesto elimina la questione.
 */

import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src')
const out = join(root, 'dist')

const watch = process.argv.includes('--watch')
const production = process.argv.includes('--production')

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

const options = {
  bundle: true,
  format: 'iife',
  target: ['firefox115', 'chrome115'],
  minify: production,
  sourcemap: production ? false : 'inline',
  legalComments: 'none',
  logLevel: 'warning',
}

const bundles = [
  { in: join(src, 'background.js'), out: join(out, 'background.js') },
  { in: join(src, 'content.js'), out: join(out, 'content.js') },
  { in: join(src, 'popup.js'), out: join(out, 'popup.js') },
]

async function copyStatic() {
  await cp(join(src, 'manifest.json'), join(out, 'manifest.json'))
  await cp(join(src, 'popup.html'), join(out, 'popup.html'))
  await cp(join(src, 'popup.css'), join(out, 'popup.css'))
  await cp(join(src, 'assets', 'img'), join(out, 'img'), { recursive: true })
  // Gli avvisi di copyright viaggiano nel pacchetto, come richiesto dalle
  // licenze del lavoro derivato. Vedi NOTICE.md.
  await cp(join(root, 'NOTICE.md'), join(out, 'NOTICE.md'))
}

if (watch) {
  for (const bundle of bundles) {
    const ctx = await esbuild.context({ ...options, entryPoints: [bundle.in], outfile: bundle.out })
    await ctx.watch()
  }
  await copyStatic()
  console.log('in ascolto')
} else {
  await Promise.all(
    bundles.map((bundle) => esbuild.build({ ...options, entryPoints: [bundle.in], outfile: bundle.out }))
  )
  await copyStatic()

  // Il peso è un requisito, non un dettaglio: il content script viene caricato
  // su ogni pagina che l'utente apre.
  const sizes = await Promise.all(
    bundles.map(async (bundle) => {
      const content = await readFile(bundle.out)
      return `  ${bundle.out.split('/').pop().padEnd(16)} ${(content.length / 1024).toFixed(1)} KB`
    })
  )
  console.log(sizes.join('\n'))
}
