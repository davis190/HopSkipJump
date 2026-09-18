// Renders the app through Vite's SSR loader and asserts the pieces that must be
// on screen. Catches a render-time crash or a missing control, which `vite build`
// alone would not: the bundle can compile and still throw on mount.
import { createServer } from 'vite'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const mod = await server.ssrLoadModule('/src/App.jsx')
const html = renderToStaticMarkup(createElement(mod.default))
await server.close()

const checks = {
  'title renders': /Hop<\/span>/.test(html),
  'length buttons 3..8': [3,4,5,6,7,8].every(n => html.includes(`>${n}</button>`)),
  'secret input is masked, not a password field': html.includes('secret-input masked') && !html.includes('type="password"'),
  'reveal toggle present': html.includes('>Show me</button>'),
  'random option present': html.includes('Generate a random 4-digit number'),
  'legend explains H/S/J': ['Jump','Skip','Hop'].every(w => html.includes(`<strong>${w}</strong>`)),
  'submit disabled until full': html.includes('disabled'),
}
let bad = 0
for (const [k, v] of Object.entries(checks)) { console.log((v ? 'PASS' : 'FAIL') + '  ' + k); if (!v) bad++ }
process.exit(bad ? 1 : 0)
