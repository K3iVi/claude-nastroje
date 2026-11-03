---
name: hlidac-compact
description: Instalace, stav a odinstalace hlídače compactu pro Claude desktop na Windows — úloha Plánovače, která velká nečinná okna (nad 200k tokenů, 50–57 min bez aktivity) zkompaktuje ještě s teplou prompt cache. Použij při „nainstaluj hlídač compactu“, „jak hlídač běží“, „co dělal hlídač“, „vypni / odinstaluj hlídač“.
---

# Hlídač compactu

Skripty leží ve složce tohoto skillu (její cestu ti aplikace ukáže jako „Base directory for this skill“):
- `hlidac-compact.ps1`: samotný hlídač. Model nevolá, tokeny nestojí.
- `instaluj.ps1`: zkopíruje hlídač do `%USERPROFILE%\.claude\hlidac-compact` a založí úlohu Plánovače „Claude hlidac compact“, která ho pouští každou minutu. S `-NaSucho` hlídač jen zapisuje do logu.
- `odinstaluj.ps1`: smaže úlohu i skripty. Log nechá, s `-VcetneLogu` smaže i log.

Všechno spouštěj přes PowerShell tool: `powershell -NoProfile -ExecutionPolicy Bypass -File "<složka skillu>\instaluj.ps1" -NaSucho`.

## Instalace
1. Uživateli řekni, co hlídač dělá. Když okno nad 200k tokenů leží 50–57 minut nečinné a PC je aspoň 10 s bez doteku, hlídač okno otevře přes odkaz `claude://`. Ověří, že je otevřené správné okno a Claude je v popředí. Pak do okna napíše `/compact` a dvakrát Enter a vrátí předchozí okno. Když to do 55. minuty nestihne, ukáže oznámení Windows.
2. Zeptej se, jestli instalovat nejdřív na sucho (doporučeno) nebo rovnou ostře. Bez souhlasu nic neinstaluj.
3. Spusť `instaluj.ps1` (`-NaSucho` podle odpovědi) a ukaž výstup.
4. Řekni uživateli, že hlídač funguje i se zhasnutým displejem, ale ne v uspání ani se zamčeným PC (Win+L). Firemní PC může PowerShell skripty, Plánovač úloh nebo SendKeys zakazovat. Pravidla IT neobcházej, uživatel se musí domluvit s IT.

Ostrý režim po zkoušce na sucho zapneš tak, že `instaluj.ps1` spustíš znovu bez `-NaSucho`.

## Stav
- Posledních 30 řádků logu: `Get-Content "$env:USERPROFILE\.claude\hlidac-compact\hlidac.log" -Tail 30`.
- Řádky logu znamenají:
  - `KOMPAKTUJI`: compact odeslán.
  - `CEKAM`: PC se používalo, hlídač to zkusí znovu za minutu.
  - `ZRUSENO`: dotek nebo jiné okno v popředí, nic se nenapsalo.
  - `HLASKA`: ukázáno oznámení.
  - `NA SUCHO`: tady by hlídač zkompaktoval.
- Stav úlohy: `Get-ScheduledTaskInfo 'Claude hlidac compact'`. Hodnota 267009 znamená, že úloha právě běží.

## Nastavení
Prahy jsou parametry na začátku `hlidac-compact.ps1` v `%USERPROFILE%\.claude\hlidac-compact`: `MinTokens` (200000), `OdMin` (50), `DoMin` (57), `NecinnostPcSec` (10). Měň je jen na pokyn uživatele. Prompt cache vydrží hodinu, takže `DoMin` nedávej nad 57.

## Omezení
Hlídač čte interní soubory aplikace (`%LOCALAPPDATA%\Claude-Data\claude_*\claude-code-sessions\**\local_*.json` a transcripty v `~/.claude/projects`). Nejde o veřejné rozhraní, takže ho aktualizace Claude může rozbít. Když v logu nic není a velká okna se nekompaktují, zkontroluj nejdřív, že tyhle soubory existují.
