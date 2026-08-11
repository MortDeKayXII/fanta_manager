// The strategy board must show the whole plan without scrolling (a mid-auction
// glance, not a scroll). Measure it rather than eyeballing: the board's scroll
// container must have scrollHeight <= clientHeight.
//
// Slots are added one at a time through the strategy builder until the board
// overflows, so the script reports the real capacity instead of assuming it.
import { chromium } from 'playwright'

const b = await chromium.launch()
const errs = []

const measure = async (p) => {
  // Wait for the board to actually be in the DOM — measuring on a race gives null.
  await p.locator('[data-strategy-board]').waitFor({ state: 'attached' })
  return p.evaluate(() => {
    const grid = document.querySelector('[data-strategy-board]')
    return {
      scrollH: grid.scrollHeight,
      clientH: grid.clientHeight,
      slots: document.querySelectorAll('[data-strategy-board] li').length,
    }
  })
}

/** The URL changes before React swaps the DOM, so wait for the destination's own
 *  content — otherwise a query can hit the previous screen. */
const LANDMARK = {
  '/strategy': 'Slot pianificati',
  '/live': 'Verifica per squadra',
}

const go = async (p, name, path) => {
  await p.getByRole('link', { name }).click()
  await p.waitForURL(`**${path}`)
  await p.getByText(LANDMARK[path], { exact: false }).first().waitFor()
  await p.waitForTimeout(120)
}

for (const [w, h] of [[1920, 1080], [1680, 1000], [1600, 900], [1440, 820]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } })
  p.on('pageerror', (e) => errs.push(`${w}x${h} PAGEERROR: ${e.message}`))
  await p.goto('http://localhost:5173/live', { waitUntil: 'networkidle' })

  const base = await measure(p)
  let capacity = base.scrollH <= base.clientH ? base.slots : 0
  const marks = {}

  for (let n = base.slots + 1; n <= 32; n++) {
    await go(p, 'Strategie', '/strategy')
    const add = p.getByRole('button', { name: 'Slot', exact: true })
    // Round-robin across buckets, the way a real plan grows.
    await add.nth((n - base.slots - 1) % (await add.count())).click()
    await go(p, 'Asta live', '/live')

    const m = await measure(p)
    if (m.scrollH <= m.clientH) capacity = m.slots
    if (m.slots === 27 || m.slots === 30) marks[m.slots] = m
  }

  const at = (n) =>
    marks[n]
      ? `${n}: ${marks[n].scrollH}/${marks[n].clientH}px ${marks[n].scrollH <= marks[n].clientH ? 'fits' : 'SCROLLS'}`
      : `${n}: n/a`
  console.log(
    `${w}x${h}  capacity ${capacity} slots  ·  ${at(27)}  ·  ${at(30)}`,
  )
  await p.close()
}

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none')
await b.close()
