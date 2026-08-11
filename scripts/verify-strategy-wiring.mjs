// Step 5 acceptance: strategy CRUD persists, and a strategy created in one
// session can be imported into another (spec §4.3: "reused across multiple
// draft sessions").
import { chromium } from 'playwright'

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))

await p.goto('http://localhost:5173/strategy', { waitUntil: 'networkidle' })
await p.waitForTimeout(800)

// --- 1. Create a strategy with a distinctive name in the demo session -----
await p.getByTitle('Nuova strategia').click()
await p.waitForTimeout(300)
const nameInput = p.locator('input.text-base').first()
await nameInput.fill('Piano da esportare')
await p.waitForTimeout(600)
console.log('strategy created:', await p.getByText('Piano da esportare').first().isVisible())

// Add one slot with a distinctive price so the copy is checkable. Scoped to
// the Difensori bucket's own <section> — the page has one "Slot" button per
// bucket, and an unscoped .first() lands on whichever bucket sorts first.
const difensoriSection = p.locator('section', { hasText: 'Dc · B · Dd · Ds' }).first()
await difensoriSection.getByRole('button', { name: 'Slot' }).click()
await p.waitForTimeout(400)
const slotPriceInput = difensoriSection.locator('li input[type=number]').first()
await slotPriceInput.fill('77')
await slotPriceInput.blur()
await p.waitForTimeout(600)
console.log('slot price set:', (await slotPriceInput.inputValue()) === '77')

// --- 2. Switch to a brand-new session -------------------------------------
await p.getByRole('link', { name: 'Impostazioni' }).click()
await p.waitForURL('**/settings')
await p.getByRole('button', { name: /Nuova sessione/ }).click()
await p.waitForTimeout(700)

// --- 3. Import the strategy from the previous session ----------------------
await p.getByRole('link', { name: 'Strategie' }).click()
await p.waitForURL('**/strategy')
await p.waitForTimeout(600)

const importSelect = p.locator('select').first()
console.log('import picker present:', await importSelect.isVisible())
const options = await importSelect.locator('option').allTextContents()
console.log('imported strategy listed:', options.some((o) => o.includes('Piano da esportare')))

const value = await importSelect
  .locator('option', { hasText: 'Piano da esportare' })
  .getAttribute('value')
await importSelect.selectOption(value)
await p.waitForTimeout(600)

// Slot prices live in <input> values, which never show up in innerText.
const importedSlotPrice = () => p.locator('li input[type=number]').first().inputValue()

const bodyText = await p.locator('body').innerText()
console.log('imported strategy now selected in new session:', /Piano da esportare/.test(bodyText))
console.log('imported slot price carried over:', (await importedSlotPrice()) === '77')

await p.reload({ waitUntil: 'networkidle' })
await p.waitForTimeout(900)
// The freshly imported strategy isn't necessarily auto-selected after reload —
// re-select it from the list before reading the editor pane.
await p.locator('button', { hasText: 'Piano da esportare' }).first().click()
await p.waitForTimeout(400)
const afterReload = await p.locator('body').innerText()
console.log('import survived reload:', /Piano da esportare/.test(afterReload))
console.log('imported slot price survived reload:', (await importedSlotPrice()) === '77')

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none')
await b.close()
