import type { EngineInterface, Register } from 'claude-code'

// Hlídač compactu uvnitř okna: velké okno, které je 25 min nečinné, zkompaktuje ještě s teplou
// hodinovou cache (compact po jejím vypršení čte celé okno znovu za plnou cenu).
// Běží v každé relaci Claude Code: Claude desktop, terminál i chat Orcy, kam zvenku nic poslat nejde.

// 25 min, ne 50: chat Orcy po 30 min nečinnosti ukončí proces Claude Code (a s ním i tento časovač)
// a při další zprávě ho obnoví (SessionStart:resume). Ověřeno v Orce 9. 11. 2026.
export const IDLE_MS = 25 * 60_000 // tak dlouho po konci tahu
export const CACHE_MS = 60 * 60_000 // TTL cache; později (PC spalo) už compact nic neušetří
export const MIN_TOKENS = 200_000 // menší okno se nevyplatí kompaktovat

let lastEnd = 0 // konec posledního tahu hlavního vlákna; 0 = právě běží tah
let timer: { cancel: () => void } | undefined

async function tryCompact($: EngineInterface, end: number): Promise<void> {
  if (lastEnd !== end) return // mezitím přišel další tah
  const idle = (await $.clock.now()) - end
  if (idle >= CACHE_MS) return
  const tokens = (await $.session.usage()).context.tokens ?? 0
  if (tokens < MIN_TOKENS) return
  $.ui.log(`hlídač compactu: okno nečinné ${Math.round(idle / 60_000)} min, ${Math.round(tokens / 1000)}k, kompaktuji před koncem cache`)
  await $.command.run({ command: 'compact' })
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
