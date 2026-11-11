import { expect, mock, test } from 'claude-code/testing'

const MIN = 60_000

const writes: { path: string; text: string }[] = []
const argsSeen: string[] = []

function env(on: Parameters<Parameters<typeof test>[1]>[1], tokens: number) {
  const runs: string[] = []
  writes.length = 0
  argsSeen.length = 0
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens, window: 1_000_000, percent: tokens / 10_000 } } }))
  on('command.run', (_, e) => {
    runs.push(e.command)
    argsSeen.push(e.args)
    return { text: '' }
  })
  on('ui.log', () => ({ value: undefined }))
  on('env.get', (_, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/t' : undefined }))
  on('session.id', () => ({ value: 's1' }))
  on('fs.write', (_, e) => {
    writes.push(e)
    return { value: undefined }
  })
  return runs
}

async function turn($: Parameters<Parameters<typeof test>[1]>[0], id: string) {
  await $.turn.start({ text: 'ahoj', turnId: id })
  await $.turn.complete({ turnId: id, reason: 'answer', answer: 'OK', durationMs: 1000, isAborted: false })
}

test('a large window idle for 50 minutes is compacted once', { timeoutMs: 20_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const runs = env(on, 250_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await turn($, 't1')
  await clock.advance(49 * MIN)
  expect(runs).toEqual([])
  await clock.advance(2 * MIN)
  await clock.settle()
  expect(runs).toEqual(['compact'])
  expect(argsSeen[0]).toContain('Zkompaktoval hlídač compactu po 50 min')
  expect(writes.length).toBe(1)
  expect(writes[0].path.replaceAll('\\', '/')).toBe('C:/Users/t/.claude/hlidac-compact/compacty/s1.json')
  expect(JSON.parse(writes[0].text).before).toBe(250_000)
  await clock.advance(60 * MIN)
  await clock.settle()
  expect(runs).toEqual(['compact'])
})

test('a new turn restarts the wait, and a small window is left alone', { timeoutMs: 20_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const runs = env(on, 250_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await turn($, 't1')
  await clock.advance(40 * MIN)
  await turn($, 't2')
  await clock.advance(40 * MIN)
  await clock.settle()
  expect(runs).toEqual([])
  await clock.advance(11 * MIN)
  await clock.settle()
  expect(runs).toEqual(['compact'])
})

test('a window under 150k is not compacted', { timeoutMs: 20_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const runs = env(on, 120_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await turn($, 't1')
  await clock.advance(55 * MIN)
  await clock.settle()
  expect(runs).toEqual([])
})
