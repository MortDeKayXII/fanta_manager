// Step 2 acceptance: state must survive a real browser reload, and a sale must
// go through the whole stack — action -> React state -> IndexedDB -> reload.
//
// This is the check the step-1 bucket test could NOT make: back then state lived
// in useState and a reload wiped it.
import { chromium } from 'playwright'

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))

const LANDMARK = {
  '/prep': 'Solo disponibili',
  '/strategy': 'Slot pianificati',
  '/live': 'Verifica per squadra',
  '/dashboard': 'Piano budget vs speso',
  '/settings': 'Reparti e quote rosa',
  '/setup': 'Importa il database giocatori',
}
const go = async (name, path) => {
  await p.getByRole('link', { name }).click()
  await p.waitForURL(`**${path}`)
  await p.getByText(LANDMARK[path], { exact: false }).first().waitFor()
  await p.waitForTimeout(150)
}
// A reload must wait for hydration from IndexedDB, not just for the DOM.
const reload = async (path) => {
  await p.reload({ waitUntil: 'networkidle' })
  await p.getByText(LANDMARK[path], { exact: false }).first().waitFor()
  await p.waitForTimeout(600)
}
const rosterCount = () =>
  p.locator('header:has-text("Real Fantacalcio") + div, section:has-text("ROSE")').first().innerText()

await p.goto('http://localhost:5173/live', { waitUntil: 'networkidle' })
await p.waitForTimeout(800) // let the seed write settle

// --- 1. A sale persists across a reload -----------------------------------
const before = await p.locator('[data-testid=my-roster-count], header').first().innerText()
await p.locator('input[placeholder*="Cerca giocatore"]').fill('Mkhitaryan')
await p.waitForTimeout(300)
await p.locator('ul li button', { hasText: 'Mkhitaryan' }).first().click()
await p.waitForTimeout(200)
await p.locator('section:has-text("ALL’ASTA") input[type=number]').fill('33')
await p.getByRole('button', { name: 'Assegna' }).click()
await p.waitForTimeout(600)

const soldNow = (await p.locator('body').innerText()).includes('Mkhitaryan')
console.log('sale applied immediately:', soldNow)

await reload('/live')
const txt = await p.locator('body').innerText()
console.log('sale survived reload:', /Mkhitaryan/.test(txt))
console.log('price survived reload:', /\b33\b/.test(txt))
console.log('sold player left the search pool:', !(await p.locator('ul li button', { hasText: 'Mkhitaryan' }).count()))

// --- 2. Undo persists too --------------------------------------------------
await p.getByRole('button', { name: 'Annulla' }).click()
await p.waitForTimeout(600)
await reload('/live')
console.log('undo survived reload:', !/Mkhitaryan/.test(await p.locator('body').innerText()))

// --- 3. A settings edit persists ------------------------------------------
await go('Impostazioni', '/settings')
await p.locator('input[value="Difensori"]').fill('Retroguardia')
await p.locator('input[type=number]').first().fill('4')
await p.waitForTimeout(600)
await reload('/settings')
// The label lives in an <input>: its text is a value, never part of innerText.
const bucketLabels = () =>
  p.locator('section:has-text("Reparti e quote rosa") input[type=text], section:has-text("Reparti e quote rosa") input:not([type])').evaluateAll(
    (els) => els.map((e) => e.value),
  )
console.log('bucket rename survived reload:', (await bucketLabels()).includes('Retroguardia'))
console.log(
  'quota change survived reload:',
  /rosa totale 26/.test(await p.locator('body').innerText()),
)

// --- 4. A new session is empty and switching back restores the old one ----
await p.getByRole('button', { name: /Nuova sessione/ }).click()
await p.waitForTimeout(700)
await go('Asta live', '/live')
const fresh = await p.locator('body').innerText()
console.log('new session has no purchases:', /0\/25/.test(fresh))

await go('Impostazioni', '/settings')
await reload('/settings')
console.log('new session reopens after reload:', /Nuova sessione/.test(await p.locator('body').innerText()))

const others = p.locator('button', { hasText: 'Apri' })
console.log('previous session still listed:', (await others.count()) > 0)
await others.first().click()
await p.waitForTimeout(700)
console.log(
  'switching back restores the edited buckets:',
  (await bucketLabels()).includes('Retroguardia'),
)

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none')
await b.close()
