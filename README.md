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

V každém okně ukáže panel se seznamem ostatních oken ve skupinách podle stavu: Čeká na tebe, Pracuje, Končí cache (do 15 minut) a Nepřečtené. Každá skupina má barevný čtvereček a počet, u oken je vpravo jejich stáří. Pod skupinami jsou sbalené sekce „Dřív“ (hotové za poslední týden) a „Odloženo“, klik na ně je rozbalí. Otázka, kterou jsi už viděl a den na ni neodpověděl, z „Čeká na tebe“ spadne do „Dřív“. Stáří okna a konec cache se počítají od poslední odpovědi okna, compact ani vlastní zápisy aplikace se nepočítají. Rozbalené sekce si panel pamatuje. Klik na okno ho otevře. Po najetí myší se u okna ukážou tlačítka „odložit“ a „skrýt“. „skrýt“ okno schová do jeho další aktivity. „odložit“ přesune okno, které teď počká, do sbalené sekce „Odloženo“ bez tečky. Nahoru se vrátí, až do něj něco napíšeš (compact se nepočítá), nebo tlačítkem „vrátit“. Klik na počet oken v hlavičce zapne nebo vypne barevný pruh se stavy, jako je pruh v panelu Context. Volba se pamatuje. Panel se otevírá sám v každém novém okně. Když ho zavřeš, napiš `/okna`: panel se znovu otevře a seznam se zároveň vypíše do chatu, hodí se třeba přes Remote Control z mobilu.

Běží celý uvnitř Claude, bez PowerShellu a Plánovače. Nic nikam neposílá. Výjimkou je přenos mezi PC: ten zapne jen soubor `%USERPROFILE%\.claude\okna-sync.json` s `{"url": "https://…", "key": "…"}`, a to na vlastní server, který si každý provozuje sám.

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
