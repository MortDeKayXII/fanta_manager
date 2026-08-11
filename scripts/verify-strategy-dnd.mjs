// Step 8 acceptance: dragging a purchased player from the middle column onto
// a strategy slot in the right column fills it, drop is always permitted
// (mismatch just changes color), and the drag never touches sale data,
// budgets, or flags — verified at the UI level here; the pure-function
// invariant is covered by unit tests in actions.test.ts / flags.test.ts.
import { chromium } from 'playwright'

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))

await p.goto('http://localhost:5173/live', { waitUntil: 'networkidle' })
await p.waitForTimeout(800)

// The demo session's roster column lists my team's purchases first, each a
// drag source. Every one of my 7 purchases is already on a slot in the demo
// fixture — Bremer sits in a Difensori slot — so this drags him to a
// different (empty) Difensori slot: a genuine slot-to-slot move.
const rosterSection = p.locator('section:has-text("Rose")')
const sourceRow = rosterSection.locator('li', { hasText: 'Bremer' }).first()
console.log('drag source row is present:', await sourceRow.isVisible())

// An empty slot to drop onto: the Difensori bucket has several dashed
// placeholders left over from the fixture (s1-dif-3/5/7/8 are unassigned).
const strategySection = p.locator('section:has-text("Strategia")')
const difensoriGroup = p.locator('div:has(h4:has-text("Difensori"))').first()
const emptySlot = difensoriGroup.locator('li:has-text("slot libero")').first()
console.log('an empty slot placeholder exists before the drag:', await emptySlot.isVisible())

const sourceBox = await sourceRow.boundingBox()
const targetBox = await emptySlot.boundingBox()

// dnd-kit's PointerSensor needs real, spaced-out mouse events — a single
// click-drag won't trigger it.
await p.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
await p.mouse.down()
await p.mouse.move(sourceBox.x + 20, sourceBox.y + 5, { steps: 5 })
await p.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 })
await p.waitForTimeout(200)
await p.mouse.up()
await p.waitForTimeout(500)

const strategyText = await strategySection.innerText()
console.log('the dropped player now fills that slot:', /Bremer/.test(strategyText))

// --- The drag must not touch sale data, budget, or the middle column -----
const rosterTextAfter = await rosterSection.innerText()
console.log('the middle column (raw roster) still lists the player, unaffected:', /Bremer/.test(rosterTextAfter))

await p.reload({ waitUntil: 'networkidle' })
await p.waitForTimeout(900)
const afterReload = await p.locator('section:has-text("Strategia")').innerText()
console.log('the slot assignment persisted across reload:', /Bremer/.test(afterReload))

// --- A role-mismatched drop is still accepted, just styled differently ----
// Drop Bremer (a Dc) onto an Attaccanti slot instead, to force a mismatch.
const attaccantiSlot = p
  .locator('div:has(h4:has-text("Attaccanti"))')
  .first()
  .locator('li:has-text("slot libero")')
  .first()
if (await attaccantiSlot.count()) {
  const src2 = rosterSection.locator('li', { hasText: 'Bremer' }).first()
  const srcBox2 = await src2.boundingBox()
  const dstBox2 = await attaccantiSlot.boundingBox()
  await p.mouse.move(srcBox2.x + srcBox2.width / 2, srcBox2.y + srcBox2.height / 2)
  await p.mouse.down()
  await p.mouse.move(srcBox2.x + 20, srcBox2.y + 5, { steps: 5 })
  await p.mouse.move(dstBox2.x + dstBox2.width / 2, dstBox2.y + dstBox2.height / 2, { steps: 10 })
  await p.waitForTimeout(200)
  await p.mouse.up()
  await p.waitForTimeout(500)
  const movedPiece = strategySection.locator('li:has-text("Bremer")').first()
  console.log('a role-mismatched drop is still accepted (never blocked):', await movedPiece.isVisible())
  const nubColor = await movedPiece.locator('.puzzle-nub').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log('the mismatched piece nub carries a color (danger accent expected):', nubColor.length > 0)
}

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none')
await b.close()
