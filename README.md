# claude-nastroje

Dva pluginy pro Claude desktop na Windows. Instalují se přímo z Claude, prohlížeč nic nestahuje.

```
claude plugin marketplace add K3iVi/claude-nastroje
claude plugin install okna@claude-nastroje
claude plugin install hlidac-compact@claude-nastroje
```

Po instalaci restartuj Claude.

Aktualizace na novou verzi:

```
claude plugin marketplace update claude-nastroje
claude plugin update okna@claude-nastroje
claude plugin update hlidac-compact@claude-nastroje
```

Pak restartuj Claude nebo v okně napiš `/reload-plugins`. Hlídač compactu běží z vlastní kopie, takže ho po aktualizaci ještě obnov: v Claude napiš „aktualizuj hlídač compactu“.

## okna — panel s přehledem oken

Panel má od verze 0.6 vlastní repo **[K3iVi/claude-okna](https://github.com/K3iVi/claude-okna)** — tam je popis, nastavení, vzorový server pro víc PC a místo pro nápady a pull requesty. Instalace odsud (`okna@claude-nastroje`) funguje dál a bere kód odtamtud; starší `okna-sync.json` nová verze čte taky.

## hlidac-compact — compact před vypršením cache

Claude drží kontext okna hodinu v prompt cache. Když se k velkému oknu vrátíš později, `/compact` (ruční i automatický) přečte celé okno znovu za plnou cenu. Hlídač to udělá ještě s platnou cache. Okno nad 200k tokenů, které je 50–57 minut nečinné, otevře, napíše do něj `/compact` a vrátí tě do okna, kde jsi byl. Sám tokeny nestojí, jde o skript spouštěný Plánovačem úloh každou minutu.

Instalace: v Claude napiš `/hlidac-compact` nebo „nainstaluj hlídač compactu“. Claude vysvětlí, co hlídač dělá, a nejdřív ho nainstaluje na sucho, kdy hlídač jen zapisuje do logu.

- **Když na PC pracuješ,** počká. Při doteku během zásahu ustoupí.
- **Když to do 55. minuty nestihne,** ukáže oznámení Windows s odkazem na okno.
- **Displej může být zhasnutý.** PC ale nesmí spát ani být zamčené.
- **Firemní PC** může PowerShell skripty, Plánovač nebo SendKeys zakazovat. Pak je potřeba schválení od IT.

## Upozornění

Oba pluginy čtou interní soubory aplikace Claude, které nejsou veřejné rozhraní. Aktualizace Claude je může rozbít. Vyzkoušeno na Windows 11 s Claude desktop z Microsoft Store, listopad 2026.

Licence MIT.
