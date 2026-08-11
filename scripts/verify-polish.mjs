// Step 10 acceptance: keyboard shortcuts on the live-draft screen (/, u, 1-9),
// and that the loading gate doesn't break normal navigation (it only shows
// during the first IndexedDB read, which is usually too fast to observe, but
// its presence must not throw or leave the app stuck).
import { chromium } from 'playwright'

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))

await p.goto('http://localhost:5173/live', { waitUntil: 'networkidle' })
await p.waitForTimeout(800)

// --- 1. App shell rendered past the loading gate ---------------------------
console.log('the app rendered nav past any loading gate:', await p.getByRole('link', { name: 'Asta live' }).isVisible())

// --- 2. "/" focuses the player search from anywhere on the page -----------
await p.locator('body').click({ position: { x: 5, y: 5 } }) // blur any field
const search = p.locator('input[placeholder*="Cerca giocatore"]')
await p.keyboard.press('/')
await p.waitForTimeout(150)
const isFocused = await search.evaluate((el) => el === document.activeElement)
console.log('"/" focuses the player search:', isFocused)

// While focused in the search box, "/" and "1"-"9" must type normally, not
// trigger the shortcut (typing a real player name could contain a digit).
await search.fill('')
await p.keyboard.type('9')
await p.waitForTimeout(150)
console.log('typing "9" while focused in search types normally, no shortcut fires:', (await search.inputValue()) === '9')
await search.fill('')

// --- 3. "1"-"9" picks the Nth team in the sale-assignment dropdown --------
await p.locator('body').click({ position: { x: 5, y: 5 } })
const teamSelect = p.locator('section:has-text("ALL’ASTA") select')
const before = await teamSelect.inputValue()
await p.keyboard.press('3')
await p.waitForTimeout(150)
const after = await teamSelect.inputValue()
console.log('"3" selects the 3rd team in the sale dropdown:', after !== before)
const thirdTeamId = await teamSelect.locator('option').nth(2).getAttribute('value')
console.log('...and it is specifically the 3rd team, not just "changed":', after === thirdTeamId)

// --- 4. "u" triggers undo (same action as clicking "Annulla") -------------
// Make a sale first so there is something to undo.
const priceInput = p.locator('section:has-text("ALL’ASTA") input[type=number]')
await priceInput.fill('12')
await p.getByRole('button', { name: 'Assegna' }).click()
await p.waitForTimeout(400)
// The sale from step 3 went to whichever team "3" selected, not necessarily
// "mine" — read the draft log length straight from IndexedDB instead of
// trying to spot one team's roster count changing in the DOM.
const logLength = () =>
  p.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('fantadraft')
        req.onsuccess = () => {
          const tx = req.result.transaction('sessions', 'readonly')
          tx.objectStore('sessions').openCursor().onsuccess = (e) => {
            const cursor = e.target.result
            resolve(cursor ? cursor.value.log.length : -1)
          }
        }
      }),
  )

await p.waitForTimeout(500) // let the debounced write land before reading it back
const logBefore = await logLength()

await p.locator('body').click({ position: { x: 5, y: 5 } })
await p.keyboard.press('u')
await p.waitForTimeout(700)
const logAfter = await logLength()
console.log('"u" undoes the last sale — draft log shrinks by exactly one:', logAfter === logBefore - 1)

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none')
await b.close()
