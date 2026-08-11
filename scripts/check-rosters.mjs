// The middle column must reach every team's roster by scrolling, with my own
// first, and each team's sticky header must stay visible while its rows scroll.
import { chromium } from 'playwright'

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1680, height: 1000 } })
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))

await p.goto('http://localhost:5173/live', { waitUntil: 'networkidle' })

const col = p.locator('section:has-text("ROSE") div.overflow-y-auto').first()
const headers = col.locator('h4')

console.log('teams listed:', await headers.count(), '(expected 8)')
console.log('my team first:', (await headers.first().innerText()).trim())

const box = await col.boundingBox()
const m = await col.evaluate((el) => ({
  scrollH: el.scrollHeight,
  clientH: el.clientHeight,
}))
console.log(`column is scrollable: ${m.scrollH > m.clientH} (${m.scrollH}/${m.clientH}px)`)

// Scroll to the bottom: the last team must become visible.
await col.evaluate((el) => el.scrollTo(0, el.scrollHeight))
await p.waitForTimeout(300)
const last = headers.last()
console.log('last team reachable by scrolling:', await last.isVisible(), '-', (await last.innerText()).trim())

// A sticky header must sit at the top of the column, not scrolled away.
const stuck = await p.evaluate(() => {
  const col = [...document.querySelectorAll('section')]
    .find((s) => s.textContent.startsWith('Rose'))
    .querySelector('div.overflow-y-auto')
  const top = col.getBoundingClientRect().top
  return [...col.querySelectorAll('header')].some(
    (h) => Math.abs(h.getBoundingClientRect().top - top) < 2,
  )
})
console.log('a team header is stuck to the top while scrolled:', stuck)

await p.screenshot({ path: 'shots/rosters-scrolled.png', clip: box })
console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none')
await b.close()
