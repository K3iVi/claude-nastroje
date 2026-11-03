import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RemotePc, Row } from '../types'

const PANE = 'okna'
const TITLE = 'Okna'
const POLL_MS = 10_000
const MAX_AGE_DAYS = 7
const SESSIONS = 'ccd_session_mgmt'
const EARLIER_MAX_ROWS = 15
const CACHE_TTL_MS = 3_600_000
const CACHE_WARN_MIN = 15
const HIDDEN_TITLE = /^RC hlídač/i
// Optional: several PCs trade their window lists through your own server. ~/.claude/okna-sync.json
// holds {"url": "https://…/api/okna", "key": "…"}; without it the pane shows this PC only and sends nothing.
const SYNC_FILE = '.claude/okna-sync.json'
const RC_LINK = /^claude:\/\/claude\.ai\/code\/session_[A-Za-z0-9]{8,64}$/

const rowsAtom = atom({ plugin: 'okna', key: 'rows' } as const, [] as Row[])
const infoAtom = atom({ plugin: 'okna', key: 'info' } as const, '')
const remoteAtom = atom({ plugin: 'okna', key: 'remote' } as const, [] as RemotePc[])
const syncAtom = atom({ plugin: 'okna', key: 'sync' } as const, '')

type Session = {
  sessionId: string
  title: string
  link?: string
  isArchived: boolean
  isRunning: boolean
  lastActivityAt: string
  remoteControlActive?: boolean
}

type Verdict = { at: string; waiting: boolean; snippet: string }

// One poll serves every window: the window that polls leaves the result in the
// plugin's store, and the others draw it while it is fresh.
type Snapshot = { at: number; rows: Row[]; info: string; remote?: RemotePc[]; sync?: string }

let isRefreshing = false

const WAIT_RE =
  /nasaď|schval|souhlas|tvoje ok|tvé ok|čekám na tebe|čeká na tebe|na tvoji|na tvou|potřebuju od tebe|potřebuji od tebe|rozhodni|vyber si|mám to udělat|mám pokračovat/i

function textOf(result: { content: { type: string; text?: string }[] }): string {
  return result.content.map(block => (block.type === 'text' ? block.text ?? '' : '')).join('')
}

// Last assistant prose of the transcript tail list_events renders, or '' when the
// tail holds only tool calls.
function lastAssistantText(transcript: string): string {
  const parts = transcript.split(/\n(?=\[(?:assistant|user|result)\])/)
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = (parts[i] ?? '').trim()
    if (part.startsWith('[user]')) return ''
    if (part.startsWith('[assistant]') && !part.startsWith('[assistant] (called')) {
      return part.slice('[assistant]'.length).trim()
    }
  }
  return ''
}

function classify(text: string): { waiting: boolean; snippet: string } {
  if (!text) return { waiting: false, snippet: '' }
  const lines = text
    .split('\n')
    .map(line => line.replace(/^[-*>#\s]+/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean)
    // The closing commit/push status lines say nothing about what is asked.
    .filter(line => !/^(necommitnuté|nepushnuté|uncommitted|unpushed)\b/i.test(line))
  // Only the closing lines count: a question quoted mid-reply is not one for the user.
  const closing = lines.slice(-3)
  const waiting = closing.some(line => /\?$/.test(line) || WAIT_RE.test(line))
  const pick = closing.slice().reverse().find(line => line.includes('?')) ?? closing[closing.length - 1] ?? ''
  return { waiting, snippet: pick.length > 160 ? `${pick.slice(0, 157)}…` : pick }
}

function age(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  if (min < 60) return `${min} min`
  const hours = Math.round(min / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.round(hours / 24)} d`
}

// The app keeps a record per window, Claude-Data/claude_*/claude-code-sessions/<account>/<org>/local_<id>.json,
// holding the wrap-up box (turnWrapUp.needsUser: its question), the app's own verdict on
// the last turn (postTurnSummary, 'blocked' when it wants the user) and lastFocusedAt (the
// sidebar's unread dot). Not a published interface: read defensively, fall back when absent.
type AppRecord = {
  turnWrapUp?: { needsUser?: string } | null
  postTurnSummary?: { status_category?: string; status_detail?: string; needs_action?: string; summarizes_uuid?: string } | null
  lastAssistantUuid?: string
  lastFocusedAt?: number
  // Remote Control sessions of the window, the current one last.
  bridgeSessionIds?: string[]
}

let recordDirs: string[] | undefined

async function findRecordDirs($: EngineInterface): Promise<string[]> {
  if (recordDirs) return recordDirs
  const dirs: string[] = []
  try {
    const { stdout } = await $.process.run(['cmd', '/c', 'echo %LOCALAPPDATA%'])
    const base = `${stdout.trim()}/Claude-Data`
    for (const profile of await $.fs.list(base)) {
      if (profile.kind !== 'dir' || !profile.name.startsWith('claude_')) continue
      const root = `${base}/${profile.name}/claude-code-sessions`
      if (!(await $.fs.exists(root))) continue
      for (const account of await $.fs.list(root)) {
        if (account.kind !== 'dir') continue
        for (const org of await $.fs.list(`${root}/${account.name}`)) {
          if (org.kind === 'dir') dirs.push(`${root}/${account.name}/${org.name}`)
        }
      }
    }
  } catch {
    // No records found: every window falls back to the transcript.
  }
  recordDirs = dirs
  return dirs
}

async function readRecord($: EngineInterface, dirs: string[], id: string): Promise<AppRecord | undefined> {
  for (const dir of dirs) {
    const path = `${dir}/${id}.json`
    if (!(await $.fs.exists(path))) continue
    try {
      return JSON.parse((await $.fs.read(path)) as string) as AppRecord
    } catch {
      return undefined
    }
  }
  return undefined
}

async function envVar($: EngineInterface, name: string): Promise<string> {
  const { stdout } = await $.process.run(['cmd', '/c', `echo %${name}%`])
  return stdout.trim()
}

// This PC's name, the server and its key; null (no syncing) while the sync file is missing.
let syncSetup: { pc: string; url: string; key: string } | null | undefined

async function findSync($: EngineInterface): Promise<{ pc: string; url: string; key: string } | null> {
  if (syncSetup !== undefined) return syncSetup
  try {
    const path = `${await envVar($, 'USERPROFILE')}/${SYNC_FILE}`
    const conf = (await $.fs.exists(path))
      ? (JSON.parse((await $.fs.read(path)) as string) as { url?: string; key?: string })
      : {}
    const url = (conf.url ?? '').replace(/\/+$/, '')
    const key = (conf.key ?? '').trim()
    syncSetup = url.startsWith('https://') && key ? { pc: await envVar($, 'COMPUTERNAME'), url, key } : null
  } catch {
    syncSetup = null
  }
  return syncSetup
}

type SentRow = Pick<Row, 'title' | 'isRunning' | 'waiting' | 'unread' | 'snippet' | 'lastActivityAt' | 'rcLink'>

// Sends this PC's windows and answers the other PCs' as the server has them. A window
// opened from here counts as read here, whatever its own PC last saw.
async function exchange($: EngineInterface, rows: Row[]): Promise<RemotePc[]> {
  const setup = await findSync($)
  if (!setup) return []
  const sent: SentRow[] = rows.slice(0, 80).map(r => ({
    title: r.title.slice(0, 300),
    isRunning: r.isRunning,
    waiting: r.waiting,
    unread: r.unread,
    snippet: r.snippet.slice(0, 400),
    lastActivityAt: r.lastActivityAt,
    rcLink: r.rcLink,
  }))
  const res = await $.http.fetch(`${setup.url}/${encodeURIComponent(setup.pc)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${setup.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: sent }),
  })
  if (!res.ok) throw new Error(`server odpověděl ${res.status}`)
  const pcs = (JSON.parse(res.text) as { pcs: { pc: string; at: number; rows: SentRow[] }[] }).pcs
  const seen = ((await $.store.get('remote-seen')) as Record<string, string> | undefined) ?? {}
  const hidden = ((await $.store.get('hidden')) as Record<string, string> | undefined) ?? {}
  return pcs
    .filter(p => p.rows.length)
    .map(p => ({
      pc: p.pc,
      at: p.at,
      rows: p.rows
        .map(r => {
          const id = `${p.pc}|${r.title}`
          const rcLink = RC_LINK.test(r.rcLink) ? r.rcLink : ''
          return { ...r, id, link: rcLink, rcLink, rc: rcLink !== '', unread: r.unread && seen[id] !== r.lastActivityAt }
        })
        .filter(r => hidden[r.id] !== r.lastActivityAt),
    }))
}

async function refresh($: EngineInterface, force = false) {
    if (isRefreshing) return
    if (!(await $.ui.panes()).some(pane => pane.id === PANE)) return
    isRefreshing = true
    try {
      const snapshot = (await $.store.get('snapshot')) as Snapshot | undefined
      if (!force && snapshot && (await $.clock.now()) - snapshot.at < POLL_MS - 2_000) {
        await update($, rowsAtom, () => snapshot.rows)
        await update($, infoAtom, () => snapshot.info)
        await update($, remoteAtom, () => snapshot.remote ?? [])
        await update($, syncAtom, () => snapshot.sync ?? '')
        return
      }
      await $.store.set('snapshot', { ...(snapshot ?? { rows: [], info: '' }), at: await $.clock.now() })
      const listed = await $.mcp.call(SESSIONS, 'list_sessions', { limit: 40 })
      if (listed.isError) {
        await update($, infoAtom, () => `Seznam oken nejde načíst: ${textOf(listed).slice(0, 200)}`)
        return
      }
      const now = await $.clock.now()
      const sessions = (JSON.parse(textOf(listed)) as Session[]).filter(
        s =>
          !s.isArchived &&
          !HIDDEN_TITLE.test(s.title) &&
          now - Date.parse(s.lastActivityAt) < MAX_AGE_DAYS * 86_400_000,
      )

      const dirs = await findRecordDirs($)
      const verdicts = ((await $.store.get('verdicts-v3')) as Record<string, Verdict> | undefined) ?? {}
      // Windows the user hid, by the activity they had then: new activity brings them back.
      const hidden = ((await $.store.get('hidden')) as Record<string, string> | undefined) ?? {}
      const rows: Row[] = []
      for (const s of sessions) {
        if (hidden[s.sessionId] === s.lastActivityAt) continue
        const record = s.isRunning ? undefined : await readRecord($, dirs, s.sessionId)
        let waiting = false
        let snippet = ''
        const summary = record?.postTurnSummary
        if (summary?.status_category && summary.summarizes_uuid === record?.lastAssistantUuid) {
          // The app's verdict on the window's last turn, the one its sidebar goes by.
          waiting = summary.status_category === 'blocked'
          snippet = waiting ? record?.turnWrapUp?.needsUser || summary.needs_action || summary.status_detail || '' : ''
        } else if (record?.turnWrapUp) {
          // The app's own record: the wrap-up box's question, verbatim.
          snippet = record.turnWrapUp.needsUser ?? ''
          waiting = snippet !== ''
        } else if (!s.isRunning) {
          // No record of the box: guess from the transcript's closing lines.
          if (verdicts[s.sessionId]?.at !== s.lastActivityAt) {
            const events = await $.mcp.call(SESSIONS, 'list_events', { session_id: s.sessionId, limit: 8 })
            const transcript = events.isError ? '' : textOf(events)
            // A turn closing on the wrap-up box with no message after it asks in the box.
            const endsInBox = /\[assistant\] \(called mcp__ccd_turn__wrap_up\)\s*(\n\[result\][^\n]*\s*)?$/.test(transcript)
            const verdict = endsInBox
              ? { waiting: true, snippet: 'Otázka je v rámečku „Další krok“ v okně' }
              : classify(lastAssistantText(transcript))
            verdicts[s.sessionId] = { at: s.lastActivityAt, ...verdict }
          }
          waiting = verdicts[s.sessionId]?.waiting ?? false
          snippet = verdicts[s.sessionId]?.snippet ?? ''
        }
        // Unread as the app's sidebar has it: activity since the user last had the window in front.
        const unread =
          !s.isRunning && record?.lastFocusedAt !== undefined && Date.parse(s.lastActivityAt) > record.lastFocusedAt
        const bridge = s.remoteControlActive
          ? (record ?? (await readRecord($, dirs, s.sessionId)))?.bridgeSessionIds
          : undefined
        const rcLink = bridge?.length ? `claude://claude.ai/code/${bridge[bridge.length - 1]}` : ''
        rows.push({
          id: s.sessionId,
          title: s.title,
          link: s.link ?? '',
          isRunning: s.isRunning,
          lastActivityAt: s.lastActivityAt,
          waiting: !s.isRunning && waiting,
          snippet,
          unread,
          rc: s.remoteControlActive ?? false,
          rcLink: RC_LINK.test(rcLink) ? rcLink : '',
        })
      }
      const live = new Set(sessions.map(s => s.sessionId))
      await $.store.set('verdicts-v3', Object.fromEntries(Object.entries(verdicts).filter(([id]) => live.has(id))))
      await $.store.set('hidden', {
        // Another PC's windows ('PC|title') stay hidden until that window moves; this PC's until gone.
        ...Object.fromEntries(Object.entries(hidden).filter(([id]) => id.includes('|')).slice(-200)),
        ...Object.fromEntries(
          sessions.filter(s => hidden[s.sessionId] === s.lastActivityAt).map(s => [s.sessionId, s.lastActivityAt]),
        ),
      })
      let remote = snapshot?.remote ?? []
      let sync = ''
      try {
        remote = await exchange($, rows)
      } catch (error) {
        sync = `Druhé PC: ${String(error).slice(0, 120)}`
      }
      await update($, rowsAtom, () => rows)
      await update($, infoAtom, () => '')
      await update($, remoteAtom, () => remote)
      await update($, syncAtom, () => sync)
      await $.store.set('snapshot', { at: await $.clock.now(), rows, info: '', remote, sync })
    } catch (error) {
      await update($, infoAtom, () => `Chyba: ${String(error).slice(0, 200)}`)
    } finally {
      isRefreshing = false
    }
}

// The prompt cache lives an hour after the last activity; resuming later re-caches
// the whole context. Minutes left in the last stretch before that, else null.
function cacheLeftMin(row: Row, now: number): number | null {
  if (row.isRunning) return null
  const left = Math.ceil((Date.parse(row.lastActivityAt) + CACHE_TTL_MS - now) / 60_000)
  return left > 0 && left <= CACHE_WARN_MIN ? left : null
}

const byActivity =(a: Row, b: Row) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt)

const short = (text: string) => (text.length > 90 ? `${text.slice(0, 89)}…` : text)

// A row with a dot wants a look: waiting, working, unread or its cache ending.
const marked = (row: Row, now: number) =>
  row.waiting || row.isRunning || row.unread || cacheLeftMin(row, now) !== null

// Top: waiting, then running, then the other marked ones. Below: the seen and
// done windows of the last week, newest first.
function ordered(rows: Row[], now: number): { top: Row[]; earlier: Row[] } {
  const waiting = rows.filter(r => r.waiting).sort(byActivity)
  const running = rows.filter(r => r.isRunning).sort(byActivity)
  const other = rows.filter(r => !r.waiting && !r.isRunning && marked(r, now)).sort(byActivity)
  const earlier = rows.filter(r => !marked(r, now)).sort(byActivity).slice(0, EARLIER_MAX_ROWS)
  return { top: [...waiting, ...running, ...other], earlier }
}

// The list as plain text, for a surface without the pane (Remote Control, phone).
function asText(rows: Row[], remote: RemotePc[], now: number): string {
  const block = (list: Row[]) => {
    const { top, earlier } = ordered(list, now)
    const lines = top.map(r => {
      const state = r.waiting ? 'ČEKÁ' : r.isRunning ? 'PRACUJE' : r.unread ? 'NOVÉ' : 'CACHE'
      const ask = r.waiting && r.snippet ? ` — ${short(r.snippet)}` : ''
      return `${state} · ${r.title} · ${age(r.lastActivityAt, now)}${ask}`
    })
    if (earlier.length) {
      lines.push('', 'Dřív:', ...earlier.map(r => `- ${r.title} · ${age(r.lastActivityAt, now)}`))
    }
    return lines
  }
  const lines = block(rows)
  for (const p of remote) lines.push('', `== ${p.pc} ==`, ...block(p.rows))
  return lines.length ? lines.join('\n') : 'Žádná okna.'
}

const isRemote = (row: Row) => row.id.includes('|')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'okna', description: 'Přehled oken: otevře panel a vypíše seznam do chatu' })
    $.clock.every(POLL_MS, () => refresh($))
    await $.ui.open({ id: PANE, title: TITLE, closeOnEscape: true })
    void refresh($)
    return next(e)
  })

  on('command.run', { command: 'okna' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, closeOnEscape: true })
    await refresh($, true)
    const info = [await read($, infoAtom), await read($, syncAtom)].filter(Boolean).join('\n')
    const text = asText(await read($, rowsAtom), await read($, remoteAtom), await $.clock.now())
    return { text: info ? `${info}\n${text}` : text }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const rows = await read($, rowsAtom)
    const info = await read($, infoAtom)
    const remote = await read($, remoteAtom)
    const sync = await read($, syncAtom)
    const now = await $.clock.now()

    // Applies `fn` to the row's list, this PC's or the other PC's it came from.
    async function editList(row: Row, fn: (list: Row[]) => Row[]) {
      if (isRemote(row)) await update($, remoteAtom, pcs => pcs.map(p => ({ ...p, rows: fn(p.rows) })))
      else await update($, rowsAtom, fn)
      await $.store.set('snapshot', { at: 0, rows: [], info: '' })
    }

    // Another PC's window opens through its Remote Control link, and only a link of that shape.
    async function openRow(row: Row) {
      if (isRemote(row)) {
        const seen = ((await $.store.get('remote-seen')) as Record<string, string> | undefined) ?? {}
        await $.store.set('remote-seen', Object.fromEntries([...Object.entries(seen).slice(-200), [row.id, row.lastActivityAt]]))
      }
      await editList(row, list => list.map(r => (r.id === row.id ? { ...r, unread: false } : r)))
      if (row.link && (!isRemote(row) || RC_LINK.test(row.link))) await $.process.run(['explorer.exe', row.link])
    }

    // Out of the list until the window does something again.
    async function hideRow(row: Row) {
      const hidden = ((await $.store.get('hidden')) as Record<string, string> | undefined) ?? {}
      await $.store.set('hidden', { ...hidden, [row.id]: row.lastActivityAt })
      await editList(row, list => list.filter(r => r.id !== row.id))
    }

    const hideButton = (row: Row) => (
      <Button key={`hide-${row.id}`} plain dimColor onPress={() => hideRow(row)}>
        <Text size="caption" dimColor>
          skrýt
        </Text>
      </Button>
    )


    // One clickable row per window, as the mobile list: state mark, title, age;
    // a waiting window adds its question in short.
    const line = (row: Row) => (
      // The dot stays outside the Button: a desktop button draws its children in one color.
      <Box key={row.id} flexDirection="column" marginBottom={1}>
        <Box flexDirection="row">
          {/* As the app's sidebar: blue = wants you (waiting or unread), orange = working, red = cache ending, none = seen and done. */}
          <Text color={row.isRunning ? '#ff8c00' : cacheLeftMin(row, now) !== null ? 'red' : 'blue'}>
            {row.isRunning || row.waiting || row.unread || cacheLeftMin(row, now) !== null ? '● ' : '   '}
          </Text>
          <Button key={row.id} onPress={() => openRow(row)}>
            {row.unread ? <Text bold>{row.title}</Text> : row.title}
            {cacheLeftMin(row, now) === null ? (
              <Text dimColor> {age(row.lastActivityAt, now)}</Text>
            ) : (
              <Text color="red"> cache končí za {cacheLeftMin(row, now)} min</Text>
            )}
          </Button>
          {row.isRunning ? null : <Text> </Text>}
          {row.isRunning ? null : hideButton(row)}
        </Box>
        {row.waiting && row.snippet ? (
          <Box paddingLeft={3}>
            <Text dimColor>{short(row.snippet)}</Text>
          </Box>
        ) : null}
      </Box>
    )

    // A seen and done window: one dim line, no dot, no gap.
    const earlierLine = (row: Row) => (
      <Box key={row.id} flexDirection="row" paddingLeft={3}>
        <Button key={row.id} onPress={() => openRow(row)}>
          <Text size="footnote" dimColor>
            {row.title} · {age(row.lastActivityAt, now)}
          </Text>
        </Button>
        <Text> </Text>
        {hideButton(row)}
      </Box>
    )

    const heading = (key: string, text: string, gap: boolean) => (
      <Box key={key} paddingLeft={3} marginTop={gap ? 1 : 0}>
        <Text size="footnote" dimColor bold>
          {text}
        </Text>
      </Box>
    )

    // One PC's windows: the marked ones, then "Dřív".
    const block = (key: string, list: Row[], gap: boolean) => {
      const { top, earlier } = ordered(list, now)
      return [
        ...top.map(line),
        ...(earlier.length ? [heading(`${key}-earlier`, 'Dřív', gap || top.length > 0)] : []),
        ...earlier.map(earlierLine),
      ]
    }

    return (
      <Box flexDirection="column">
        {info ? <Text color="red">{info}</Text> : null}
        {block('local', rows, false)}
        {remote.flatMap(p => [heading(`pc-${p.pc}`, p.pc, true), ...block(p.pc, p.rows, false)])}
        {sync ? (
          <Box paddingLeft={3} marginTop={1}>
            <Text size="caption" dimColor>
              {sync}
            </Text>
          </Box>
        ) : null}
      </Box>
    )
  })
}
