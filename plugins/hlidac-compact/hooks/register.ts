import type { EngineInterface, Register } from 'claude-code'

// Hlídač compactu uvnitř okna: velké okno, které je 50 min nečinné, zkompaktuje ještě s teplou
// hodinovou cache (compact po jejím vypršení čte celé okno znovu za plnou cenu).
// Běží v každé relaci Claude Code: Claude desktop, terminál i chat Orcy, kam zvenku nic poslat nejde.

// Chat Orcy ukončí nečinný proces Claude Code (a s ním i tento časovač) podle nastavení
// „Stop idle agents after“ (výchozí 30 min). Aby hlídač v Orce fungoval, nastav tam 1 h nebo víc.
export const IDLE_MS = 50 * 60_000 // tak dlouho po konci tahu
export const CACHE_MS = 60 * 60_000 // TTL cache; později (PC spalo) už compact nic neušetří
export const MIN_TOKENS = 150_000 // menší okno se nevyplatí kompaktovat

let lastEnd = 0 // konec posledního tahu hlavního vlákna; 0 = právě běží tah
let timer: { cancel: () => void } | undefined

async function tryCompact($: EngineInterface, end: number): Promise<void> {
  if (lastEnd !== end) return // mezitím přišel další tah
  const idle = (await $.clock.now()) - end
  if (idle >= CACHE_MS) return
  const tokens = (await $.session.usage()).context.tokens ?? 0
  if (tokens < MIN_TOKENS) return
  const min = Math.round(idle / 60_000)
  const k = Math.round(tokens / 1000)
  $.ui.log(`hlídač compactu: okno nečinné ${min} min, ${k}k, kompaktuji před koncem cache`)
  // Chat Orcy řádek z ui.log nezobrazí: poznámka jde i do shrnutí a záznam do souboru pro panel Okna.
  await $.command.run({
    command: 'compact',
    args: `Na úplný začátek shrnutí dej samostatný řádek: „🗜 Zkompaktoval hlídač compactu po ${min} min nečinnosti (okno mělo ${k}k).“`,
  })
  await record($, end, idle, tokens).catch(() => undefined)
}

// Záznam posledního compactu okna: ~/.claude/hlidac-compact/compacty/<id relace>.json
async function record($: EngineInterface, end: number, idle: number, before: number): Promise<void> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  if (!home) return
  const sessionId = await $.session.id()
  const after = (await $.session.usage()).context.tokens ?? null
  const row = { sessionId, at: new Date(end + idle).toISOString(), idleMin: Math.round(idle / 60_000), before, after }
  await $.fs.write(`${home}/.claude/hlidac-compact/compacty/${sessionId}.json`, JSON.stringify(row) + '\n')
}

export const register: Register = on => {
  on('turn.start', (_$, e, next) => {
    if (e.agentId === undefined) {
      lastEnd = 0
      timer?.cancel()
      timer = undefined
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const end = await $.clock.now()
    lastEnd = end
    timer?.cancel()
    timer = $.clock.after(IDLE_MS, () => {
      void tryCompact($, end).catch(() => undefined)
    })
    return result
  })
}
