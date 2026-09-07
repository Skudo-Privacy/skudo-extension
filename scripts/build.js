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

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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

/**
 * Il server a cui parla questa versione. Non è un'impostazione dell'utente:
 * vedi src/shared/config.js per il perché. Si cambia solo qui, ricostruendo.
 */
const instance = process.env.SKUDO_INSTANCE || 'https://app.skudo.org'

/**
 * Da dove si prendono le icone dei siti.
 *
 * Separato dall'indirizzo dell'API perche' e' proprio il punto: le icone si
 * chiedono senza token, e su un host che non ha cookie di nessuno. Chi
 * distribuisce una propria versione e non ha un host statico separato lascia il
 * valore com'e', e le prende dalla stessa applicazione.
 */
const icons = process.env.SKUDO_ICONS_URL || `${instance}/icons`

const options = {
  bundle: true,
  define: {
    __SKUDO_INSTANCE__: JSON.stringify(instance),
    __SKUDO_ICONS__: JSON.stringify(icons),
  },
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
  { in: join(src, 'connect.js'), out: join(out, 'connect.js') },
]

/**
 * I token del sistema visivo, scritti come foglio di stile.
 *
 * Il pannello iniettato li prende da `src/shared/tokens.js` come stringa,
 * perche' vive dentro uno shadow root e non puo' linkare un file. Il popup e la
 * pagina di collegamento sono documenti veri e un file lo linkano. Generarlo da
 * quello stesso modulo e' l'unico modo per non ritrovarsi due tavolozze che
 * divergono di quattro punti di grigio: una differenza che non si nota
 * guardando e si nota usando.
 */
async function writeTokens() {
  const { TOKENS, TOKENS_DARK, FONT_FACE } = await import(join(src, 'shared', 'tokens.js'))

  await writeFile(
    join(out, 'tokens.css'),
    `/* Generato da src/shared/tokens.js. Non modificare a mano. */\n` +
      `${FONT_FACE.trim()}\n\n` +
      `:root {\n${TOKENS.trimEnd()}\n}\n\n` +
      `@media (prefers-color-scheme: dark) {\n` +
      `  :root:not([data-theme='light']) {\n${TOKENS_DARK.trimEnd()}\n  }\n}\n\n` +
      `:root[data-theme='dark'] {\n${TOKENS_DARK.trimEnd()}\n}\n`
  )
}

async function copyStatic() {
  await writeTokens()
  await cp(join(src, 'manifest.json'), join(out, 'manifest.json'))
  await cp(join(src, 'popup.html'), join(out, 'popup.html'))
  await cp(join(src, 'popup.css'), join(out, 'popup.css'))
  await cp(join(src, 'connect.html'), join(out, 'connect.html'))
  await cp(join(src, 'connect.css'), join(out, 'connect.css'))
  await cp(join(src, 'assets', 'img'), join(out, 'img'), { recursive: true })
  // Inter, incluso invece che preso da un CDN: vedi il commento in
  // src/shared/tokens.js. La licenza viaggia con il carattere.
  await cp(join(src, 'assets', 'fonts'), join(out, 'fonts'), { recursive: true })
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
  console.log(`\n  server        ${instance}`)
  console.log(`  icone         ${icons}`)
}
