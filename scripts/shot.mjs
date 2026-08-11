// Dev helper: screenshot a route and report console errors.
// Usage: node scripts/shot.mjs <route> <outfile> [width] [height]
// Pass the route WITHOUT a leading slash — Git Bash rewrites those to paths.
import { chromium } from 'playwright'

const [route = 'live', out = 'shot.png', w = '1680', h = '1000'] =
  process.argv.slice(2)

const clean = route.replace(/^.*[\\/]/, '') || 'live'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: +w, height: +h } })

const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(`http://localhost:5173/${clean}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.screenshot({ path: out })

console.log('route:', clean)
console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none')
await browser.close()
