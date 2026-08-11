/**
 * Importer tests (plan step 3).
 *
 * The spec's requirement is "forgiving": these cases are the concrete meaning of
 * that word, and each one is a shape my Google Sheet has actually taken or could
 * plausibly take after an edit.
 */

import { describe, expect, it } from 'vitest'

import {
  buildPlayers,
  guessMapping,
  importFromText,
  missingFields,
  normalizeClub,
  parsePrice,
  parseRoles,
  parseTable,
  parseTier,
  type ImportResult,
} from '@/lib/import'
import { defaultTiers } from '@/lib/tiers'

const id = (i: number) => `p${i}`
// Default preset: tit/pan/sco (see lib/tiers.ts) — tiers are user-defined, so
// every call below passes them explicitly rather than relying on a hardcoded set.
const TIERS = defaultTiers()

/** Issues about a specific row, as opposed to the file-level "missing column" ones. */
const rowIssues = (r: ImportResult) => r.issues.filter((i) => i.row > 0)
/** File-level issues (row 0). */
const fileIssues = (r: ImportResult) => r.issues.filter((i) => i.row === 0)

const TSV = [
  'RUOLO\tNOME\tSQUADRA\tPREZZO MEDIO ASTE\tFASCIA\tFANTARUOLO',
  'Pc\tKean\tfio\t46\tTIT\tPcTIT',
  'C,T\tMcTominay\tNAP\t41\tTIT\tCTIT',
  'Dc,B\tBastoni\tINT\t42\tTIT\tDcTIT',
].join('\n')

describe('delimiter sniffing', () => {
  it('reads a tab-separated paste', () => {
    const t = parseTable(TSV)
    expect(t.delimiter).toBe('\t')
    expect(t.headers).toHaveLength(6)
    expect(t.rows).toHaveLength(3)
  })

  it('reads a comma-separated file', () => {
    const t = parseTable('RUOLO,NOME,SQUADRA\nPc,Kean,FIO')
    expect(t.delimiter).toBe(',')
    expect(t.rows[0]).toEqual(['Pc', 'Kean', 'FIO'])
  })

  it('reads a semicolon export without splitting the multi-role cell', () => {
    // The Italian locale export: ';' separates columns, ',' separates roles.
    const t = parseTable('RUOLO;NOME;SQUADRA\n"Dc,B";Bastoni;INT')
    expect(t.delimiter).toBe(';')
    expect(t.rows[0]).toEqual(['Dc,B', 'Bastoni', 'INT'])
  })

  it('prefers tabs over the commas inside role cells', () => {
    const t = parseTable('RUOLO\tNOME\nDc,B\tBastoni')
    expect(t.delimiter).toBe('\t')
    expect(t.rows[0]).toEqual(['Dc,B', 'Bastoni'])
  })

  it('ignores blank lines and trailing whitespace', () => {
    const t = parseTable('\nRUOLO\tNOME \n\nPc\t Kean \n\n')
    expect(t.headers).toEqual(['RUOLO', 'NOME'])
    expect(t.rows).toEqual([['Pc', 'Kean']])
  })
})

describe('header mapping', () => {
  it('maps the documented sheet columns', () => {
    expect(guessMapping(parseTable(TSV).headers)).toEqual({
      RUOLO: 'roles',
      NOME: 'name',
      SQUADRA: 'real_team',
      'PREZZO MEDIO ASTE': 'avg_price',
      FASCIA: 'tier',
      FANTARUOLO: 'fanta_role',
    })
  })

  it('tolerates casing, accents and punctuation in headers', () => {
    const m = guessMapping(['ruolo', 'Nomé', 'squadra ', 'Prezzo-Medio_Aste', 'fascia'])
    expect(m['ruolo']).toBe('roles')
    expect(m['Nomé']).toBe('name')
    expect(m['squadra ']).toBe('real_team')
    expect(m['Prezzo-Medio_Aste']).toBe('avg_price')
  })

  it('matches a header the sheet has since renamed', () => {
    // A season suffix must not break the mapping — that's the whole point of §3.
    const m = guessMapping(['RUOLO', 'GIOCATORE', 'CLUB', 'PREZZO MEDIO ASTE 25/26'])
    expect(m['GIOCATORE']).toBe('name')
    expect(m['CLUB']).toBe('real_team')
    expect(m['PREZZO MEDIO ASTE 25/26']).toBe('avg_price')
  })

  it('never assigns one field to two columns', () => {
    const m = guessMapping(['NOME', 'PREZZO MEDIO ASTE', 'PREZZO', 'RUOLO'])
    const prices = Object.values(m).filter((f) => f === 'avg_price')
    expect(prices).toHaveLength(1)
    // The specific alias wins over the loose one.
    expect(m['PREZZO MEDIO ASTE']).toBe('avg_price')
  })

  it('leaves an unrecognized column ignored rather than guessing', () => {
    const m = guessMapping(['RUOLO', 'NOME', 'NOTE INTERNE'])
    expect(m['NOTE INTERNE']).toBe('')
  })

  it('reports the required fields a mapping is missing', () => {
    expect(missingFields({ A: 'name' })).toEqual(['roles'])
    expect(missingFields({ A: 'name', B: 'roles' })).toEqual([])
  })
})

describe('cell coercion', () => {
  it('splits roles on any separator the sheet has used', () => {
    for (const cell of ['Dc,B', 'Dc/B', 'Dc; B', 'Dc | B', 'Dc B']) {
      expect(parseRoles(cell).roles).toEqual(['Dc', 'B'])
    }
  })

  it('normalizes role casing to the stored form', () => {
    expect(parseRoles('pc,DC').roles).toEqual(['Pc', 'Dc'])
  })

  it('deduplicates a repeated role', () => {
    expect(parseRoles('Dc,Dc,B').roles).toEqual(['Dc', 'B'])
  })

  it('reports unknown role tokens separately from valid ones', () => {
    const { roles, unknown } = parseRoles('Dc,ZZ')
    expect(roles).toEqual(['Dc'])
    expect(unknown).toEqual(['ZZ'])
  })

  it('parses prices with currency symbols and both decimal conventions', () => {
    expect(parsePrice('46')).toBe(46)
    expect(parsePrice('€ 46')).toBe(46)
    expect(parsePrice(' 46,5 ')).toBe(46.5)
    expect(parsePrice('46.5')).toBe(46.5)
    // Italian thousands separator: not 1.234 credits.
    expect(parsePrice('1.234')).toBe(1234)
    expect(parsePrice('1.234,50')).toBe(1234.5)
    expect(parsePrice('')).toBeUndefined()
    expect(parsePrice('n/d')).toBeUndefined()
  })

  it('parses tiers from ids, full labels, and single-letter initials', () => {
    expect(parseTier('tit', TIERS)).toBe('tit')
    expect(parseTier(' TIT ', TIERS)).toBe('tit')
    expect(parseTier('Titolare', TIERS)).toBe('tit')
    expect(parseTier('scommessa', TIERS)).toBe('sco')
    expect(parseTier('T', TIERS)).toBe('tit') // unique initial among Titolare/Panchina/Scommessa
    expect(parseTier('??', TIERS)).toBeUndefined()
  })

  it('uppercases club codes and collapses spaces', () => {
    expect(normalizeClub(' fio ')).toBe('FIO')
    expect(normalizeClub('hellas  verona')).toBe('HELLAS VERONA')
  })
})

describe('building players', () => {
  it('imports the documented format', () => {
    const r = importFromText(TSV, id, TIERS)
    expect(r.issues).toEqual([])
    expect(r.skipped).toBe(0)
    expect(r.players).toEqual([
      { id: 'p0', name: 'Kean', real_team: 'FIO', roles: ['Pc'], avg_price: 46, tier: 'tit', status: 'available' },
      { id: 'p1', name: 'McTominay', real_team: 'NAP', roles: ['C', 'T'], avg_price: 41, tier: 'tit', status: 'available' },
      { id: 'p2', name: 'Bastoni', real_team: 'INT', roles: ['Dc', 'B'], avg_price: 42, tier: 'tit', status: 'available' },
    ])
  })

  it('imports with FANTARUOLO absent entirely (spec §3)', () => {
    const r = importFromText(
      'RUOLO\tNOME\tSQUADRA\tPREZZO MEDIO ASTE\tFASCIA\nPc\tKean\tFIO\t46\tTIT',
      id,
      TIERS,
    )
    expect(r.issues).toEqual([])
    expect(r.players).toHaveLength(1)
  })

  it('recovers the tier from FANTARUOLO when FASCIA is blank', () => {
    const r = importFromText(
      'RUOLO\tNOME\tFASCIA\tFANTARUOLO\nPc\tKean\t\tPcSCO',
      id,
      TIERS,
    )
    expect(r.players[0].tier).toBe('sco')
    expect(rowIssues(r)[0].severity).toBe('warn')
    expect(r.repaired).toBe(1)
  })

  it('defaults an unreadable tier to the first configured one, with a warning, not a skip', () => {
    const r = importFromText('RUOLO\tNOME\tFASCIA\nPc\tKean\t???', id, TIERS)
    expect(r.players[0].tier).toBe(TIERS[0].id)
    expect(r.skipped).toBe(0)
    expect(rowIssues(r).map((i) => i.severity)).toEqual(['warn'])
  })

  it('defaults a missing or non-numeric price to 0 with a warning', () => {
    const r = importFromText(
      'RUOLO\tNOME\tPREZZO MEDIO ASTE\nPc\tKean\t\nPc\tRetegui\tn/d',
      id,
      TIERS,
    )
    expect(r.players.map((p) => p.avg_price)).toEqual([0, 0])
    expect(rowIssues(r)).toHaveLength(2)
    expect(r.skipped).toBe(0)
  })

  it('clamps a negative price to 0', () => {
    const r = importFromText('RUOLO\tNOME\tPREZZO MEDIO ASTE\nPc\tKean\t-5', id, TIERS)
    expect(r.players[0].avg_price).toBe(0)
  })

  it('skips a row with no name and reports the row number', () => {
    const r = importFromText('RUOLO\tNOME\nPc\tKean\nPc\t\nDc\tBastoni', id, TIERS)
    expect(r.players.map((p) => p.name)).toEqual(['Kean', 'Bastoni'])
    expect(r.skipped).toBe(1)
    // Spreadsheet numbering: the header is row 1, so the bad row is row 3.
    expect(rowIssues(r)[0].row).toBe(3)
  })

  it('skips a row whose roles are all unrecognized', () => {
    const r = importFromText('RUOLO\tNOME\nZZ\tMisterioso\nPc\tKean', id, TIERS)
    expect(r.players.map((p) => p.name)).toEqual(['Kean'])
    expect(r.skipped).toBe(1)
    expect(rowIssues(r)[0].severity).toBe('error')
  })

  it('keeps a player whose roles are only partly recognized', () => {
    const r = importFromText('RUOLO\tNOME\nDc,ZZ\tBastoni', id, TIERS)
    expect(r.players[0].roles).toEqual(['Dc'])
    expect(rowIssues(r)[0].severity).toBe('warn')
    expect(r.skipped).toBe(0)
  })

  it('lets a later duplicate row override an earlier one', () => {
    // The sheet is edited by hand; a re-pasted row is a correction, not a clone.
    const r = importFromText(
      'RUOLO\tNOME\tSQUADRA\tPREZZO MEDIO ASTE\nPc\tKean\tFIO\t46\nPc\tKean\tFIO\t52',
      id,
      TIERS,
    )
    expect(r.players).toHaveLength(1)
    expect(r.players[0].avg_price).toBe(52)
    expect(r.issues.map((i) => i.message)).toContainEqual(
      expect.stringMatching(/Duplicato/),
    )
  })

  it('treats same-name players at different clubs as distinct', () => {
    const r = importFromText(
      'RUOLO\tNOME\tSQUADRA\nPc\tPereira\tFIO\nPc\tPereira\tCOM',
      id,
      TIERS,
    )
    expect(r.players).toHaveLength(2)
    expect(rowIssues(r)).toEqual([])
  })

  it('warns but imports when the club is missing', () => {
    const r = importFromText('RUOLO\tNOME\tSQUADRA\nPc\tKean\t', id, TIERS)
    expect(r.players[0].real_team).toBe('')
    expect(rowIssues(r)[0].severity).toBe('warn')
  })

  it('refuses the whole import when a required field is unmapped', () => {
    const table = parseTable('COLONNA\tALTRA\nx\ty')
    const r = buildPlayers(table, { COLONNA: '', ALTRA: '' }, id, TIERS)
    expect(r.players).toEqual([])
    expect(r.issues.map((i) => i.field).sort()).toEqual(['name', 'roles'])
    expect(r.skipped).toBe(1)
  })

  it('honours a hand-corrected mapping over the guess', () => {
    // Two name-ish columns: the user picks which one is the player.
    const table = parseTable('RUOLO\tNOME\tNOME COMPLETO\nPc\tKean\tMoise Kean')
    const r = buildPlayers(
      table,
      { RUOLO: 'roles', NOME: '', 'NOME COMPLETO': 'name' },
      id,
      TIERS,
    )
    expect(r.players[0].name).toBe('Moise Kean')
  })

  it('imports every row of a wide, messy, realistic paste', () => {
    const messy = [
      'RUOLO;NOME;SQUADRA;PREZZO MEDIO ASTE;FASCIA;FANTARUOLO;NOTE',
      'Por;Svilar;rom;21;TIT;PorTIT;',
      '"Dc,B";Bastoni; INT ;€ 42;Titolare;DcTIT;muro',
      '"Ds/E";Dorgu;LEC;11,5;scommessa;;',
      'C T;McTominay;NAP;1.234;tit;;',
      ';;;;;;',
      'Pc;Kean;FIO;;;PcSCO;',
    ].join('\n')

    const r = importFromText(messy, id, TIERS)
    expect(r.players.map((p) => p.name)).toEqual([
      'Svilar',
      'Bastoni',
      'Dorgu',
      'McTominay',
      'Kean',
    ])
    expect(r.skipped).toBe(0)
    expect(r.players[2].avg_price).toBe(11.5)
    expect(r.players[3].avg_price).toBe(1234)
    expect(r.players[4].tier).toBe('sco') // mined from FANTARUOLO
    expect(r.players[1].real_team).toBe('INT')
    expect(r.mapping['NOTE']).toBe('')
  })

  it('reports a missing optional column once, not once per row', () => {
    // A 500-row sheet without a FASCIA column must not produce 500 warnings:
    // that would bury the handful of genuine per-row problems.
    const rows = Array.from({ length: 20 }, (_, i) => `Pc\tGiocatore${i}`).join('\n')
    const r = importFromText(`RUOLO\tNOME\n${rows}`, id, TIERS)

    expect(r.players).toHaveLength(20)
    expect(rowIssues(r)).toEqual([])
    expect(fileIssues(r).map((i) => i.field).sort()).toEqual([
      'avg_price',
      'real_team',
      'tier',
    ])
    expect(fileIssues(r).every((i) => i.severity === 'warn')).toBe(true)
    expect(r.repaired).toBe(0)
  })

  it('returns an empty result for empty input rather than throwing', () => {
    const r = importFromText('', id, TIERS)
    expect(r.players).toEqual([])
  })
})
