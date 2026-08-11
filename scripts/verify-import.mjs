// Step 3 acceptance: the import flow end to end in a real browser.
//
// The case that matters most is the last one: re-importing mid-draft must refresh
// prices without forgetting who has already been bought.
import { chromium } from 'playwright'

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))

const LANDMARK = {
  '/setup': 'Importa il database giocatori',
  '/prep': 'Solo disponibili',
  '/live': 'Verifica per squadra',
  '/settings': 'Reparti e quote rosa',
}
const go = async (name, path) => {
  await p.getByRole('link', { name }).click()
  await p.waitForURL(`**${path}`)
  await p.getByText(LANDMARK[path], { exact: false }).first().waitFor()
  await p.waitForTimeout(150)
}
const reload = async (path) => {
  await p.reload({ waitUntil: 'networkidle' })
  await p.getByText(LANDMARK[path], { exact: false }).first().waitFor()
  await p.waitForTimeout(600)
}
const body = () => p.locator('body').innerText()

// A messy paste, exercising every forgiving branch at once.
const PASTE = [
  'RUOLO;NOME;SQUADRA;PREZZO MEDIO ASTE;FASCIA;FANTARUOLO;NOTE',
  'Por;Testagatti;rom;21;TIT;PorTIT;',
  '"Dc,B";Testalonga; INT ;€ 42;Titolare;DcTIT;muro',
  '"Ds/E";Testapiede;LEC;11,5;scommessa;;',
  ';;;;;;',                       // blank row -> silently ignored
  'ZZ;Testaignoto;NAP;5;TIT;;',   // unknown role -> skipped with an error
  'Pc;Testapunta;FIO;;;PcSCO;',   // no price, tier mined from FANTARUOLO
].join('\n')

const paste = async (text) => {
  await p.locator('summary', { hasText: 'incolla direttamente' }).click()
  await p.locator('textarea').fill(text)
  await p.getByRole('button', { name: 'Analizza il testo incollato' }).click()
  await p.getByText('Associa le colonne').waitFor()
  await p.waitForTimeout(200)
}

await p.goto('http://localhost:5173/setup', { waitUntil: 'networkidle' })
await p.waitForTimeout(800)

const playersBefore = Number(
  (await body()).match(/Database attuale\s*(\d+) giocatori/)?.[1] ?? -1,
)
console.log('demo database loaded:', playersBefore > 0)

// --- 1. Parse, map, preview ------------------------------------------------
await paste(PASTE)
const mapped = await p.locator('section:has-text("Associa le colonne") select').evaluateAll(
  (els) => els.map((e) => e.value),
)
console.log('semicolon delimiter detected:', (await body()).includes('separatore ;'))
console.log(
  'columns auto-mapped:',
  JSON.stringify(mapped) ===
    JSON.stringify(['roles', 'name', 'real_team', 'avg_price', 'tier', 'fanta_role', '']),
)

const preview = await body()
console.log('4 of 5 rows importable, 1 skipped:', /4 giocatori pronti/.test(preview))
console.log('skipped row reported:', /1 riga scartata/.test(preview))
console.log('bad row identified by number:', /riga 6 —/.test(preview))
console.log('club uppercased in preview:', /\bINT\b/.test(preview))
console.log('euro price parsed:', /\b42\b/.test(preview))
console.log('italian decimal parsed:', /11[.,]5/.test(preview))
console.log('tier mined from FANTARUOLO:', /Fascia dedotta da FANTARUOLO/.test(preview))

// --- 2. A hand-corrected mapping wins over the guess ----------------------
const nameSelect = p.locator('section:has-text("Associa le colonne") select').nth(1)
await nameSelect.selectOption('')
await p.waitForTimeout(250)
console.log(
  'unmapping a required column blocks the import:',
  /Manca l’associazione per/.test(await body()) &&
    (await p.getByRole('button', { name: /Aggiorna il database/ }).isDisabled()),
)
await nameSelect.selectOption('name')
await p.waitForTimeout(250)

// --- 3. Merge commits, and survives a reload -----------------------------
await p.getByRole('button', { name: /Aggiorna il database/ }).click()
await p.waitForTimeout(700)
const after = await body()
console.log('merge reported what it did:', /Aggiornati \d+, aggiunti 4/.test(after))
console.log(
  'database grew by exactly 4:',
  new RegExp(`Database attuale\\s*${playersBefore + 4} giocatori`).test(after),
)

await reload('/setup')
// The database list is capped at 50 rows, so a new player must be searched for.
const search = async (q) => {
  await p.locator('input[placeholder="Cerca nome o squadra"]').fill(q)
  await p.waitForTimeout(300)
  return body()
}
console.log('import survived reload:', (await search('Testagatti')).includes('Testagatti'))

// --- 4. Imported players are usable in the draft -------------------------
await go('Asta live', '/live')
await p.locator('input[placeholder*="Cerca giocatore"]').fill('Testalonga')
await p.waitForTimeout(300)
await p.locator('ul li button', { hasText: 'Testalonga' }).first().click()
await p.waitForTimeout(200)
await p.locator('section:has-text("ALL’ASTA") input[type=number]').fill('50')
await p.getByRole('button', { name: 'Assegna' }).click()
await p.waitForTimeout(700)
console.log('imported player can be bought:', (await body()).includes('Testalonga'))

// --- 5. THE case: re-import mid-draft keeps the purchase ----------------
await go('Setup', '/setup')
await paste(
  [
    'RUOLO;NOME;SQUADRA;PREZZO MEDIO ASTE;FASCIA',
    '"Dc,B";Testalonga;INT;99;SCO',       // already sold — price must refresh
    'Pc;Testanuovo;JUV;30;TIT',           // genuinely new
  ].join('\n'),
)
await p.getByRole('button', { name: /Aggiorna il database/ }).click()
await p.waitForTimeout(700)
console.log('re-import preserved the purchase:', /1 già assegnati/.test(await body()))
console.log('re-import refreshed the price:', /\b99\b/.test(await search('Testalonga')))

await go('Asta live', '/live')
await p.waitForTimeout(300)
console.log(
  'sold player still on my roster after re-import:',
  (await body()).includes('Testalonga'),
)
console.log(
  'undo still available (log intact):',
  !(await p.getByRole('button', { name: 'Annulla' }).isDisabled()),
)

// --- 6. Manual add / edit / delete -------------------------------------
await go('Setup', '/setup')
await p.getByRole('button', { name: /Aggiungi giocatore/ }).click()
await p.locator('input[placeholder="Nome"]').fill('Testamano')
await p.locator('input[placeholder="Club"]').fill('ata')
await p.locator('input[placeholder="prezzo"]').fill('7')
await p.locator('button', { hasText: /^Pc$/ }).first().click()
await p.getByRole('button', { name: 'Salva' }).click()
await p.waitForTimeout(500)
console.log('manual add worked:', (await search('Testamano')).includes('Testamano'))

await p.locator('button[title="Modifica"]').first().click()
await p.locator('input[placeholder="Nome"]').fill('Testamano II')
await p.getByRole('button', { name: 'Salva' }).click()
await p.waitForTimeout(500)
console.log('manual edit worked:', (await body()).includes('Testamano II'))

await p.locator('button[title="Elimina"]').first().click()
await p.waitForTimeout(500)
console.log('manual delete worked:', !(await body()).includes('Testamano II'))

// A sold player must not be deletable — the log references them by id.
await search('Testalonga')
console.log(
  'sold player cannot be deleted:',
  await p
    .locator('button[title="Non eliminabile: annulla prima la vendita"]')
    .first()
    .isDisabled(),
)

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none')
await b.close()
