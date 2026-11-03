import { expect, test } from 'claude-code/testing'

const NOW = Date.parse('2026-11-03T12:00:00Z')
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()

const row = (id: string, title: string, extra: Record<string, unknown>) => ({
  id,
  title,
  link: '',
  isRunning: false,
  lastActivityAt: ago(300),
  waiting: false,
  snippet: '',
  unread: false,
  rc: false,
  rcLink: '',
  turn: `turn-${id}`,
  deferred: false,
  ...extra,
})

const ROWS = [
  row('a', 'Generátor smluv', { waiting: true, snippet: 'Mám to nasadit?', lastActivityAt: ago(120) }),
  row('b', 'Hromosvody', { isRunning: true, lastActivityAt: ago(1) }),
  row('c', 'JK rozbor OVP', { lastActivityAt: ago(52) }),
  row('d', 'MCP průvodce', { unread: true, lastActivityAt: ago(70) }),
  row('e', 'Starší okno', { lastActivityAt: ago(600) }),
  row('f', 'Odložené okno', { deferred: true, waiting: true, snippet: 'Počká?' }),
]

const PANE = {
  plugin: 'okna',
  component: 'Pane',
  requestId: 'okna',
  props: {
    title: 'Okna',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// The engine's answers: the clock, and the pane's values as a refresh left them.
function seed(on: Parameters<Parameters<typeof test>[1]>[1], bar: boolean) {
  on('clock.now', () => ({ value: NOW }))
  on('state.get', (_, e) => ({
    value: { value: e.key === 'rows' ? ROWS : e.key === 'bar' ? bar : undefined, version: 1 },
  }))
}

test('groups, counts and ages as in the Context pane', async ($, on) => {
  seed(on, false)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /^6 oken$/ }))?.text).toBe('6 oken')
  for (const label of ['Čeká na tebe', 'Pracuje', 'Končí cache', 'Nepřečtené']) {
    expect((await ui.find({ type: 'Text', text: new RegExp(label) }))?.text).toBe(`■ ${label}`)
  }
  expect((await ui.find({ type: 'Text', text: /za 8 min/ }))?.text).toBe('za 8 min')
  expect((await ui.find({ type: 'Text', text: /Mám to nasadit/ }))?.text).toBe('Mám to nasadit?')
  // Folded: "Dřív" and "Odloženo" show their names, not their windows.
  expect((await ui.find({ type: 'Text', text: /Dřív/ }))?.text).toBe('› Dřív')
  expect((await ui.find({ type: 'Text', text: /Odloženo/ }))?.text).toBe('› Odloženo')
  expect(await ui.find({ type: 'Text', text: /Odložené okno/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Starší okno/ })).toBeUndefined()
  // No bar unless switched on.
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('the bar, when switched on: an SVG on desktop, blocks on the terminal', async ($, on) => {
  seed(on, true)
  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desktop.find({ type: 'Svg' })).toBeDefined()
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await terminal.find({ type: 'Text', text: /█/ }))?.text).toMatch(/^█+$/)
  await terminal.unmount()
})

test('every surface draws the pane', async ($, on) => {
  seed(on, true)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Čeká na tebe/ }))?.text).toBe('■ Čeká na tebe')
    await ui.unmount()
  }
})
