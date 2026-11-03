# claude-nastroje

Dva pluginy pro Claude desktop na Windows. Instalují se přímo z Claude, prohlížeč nic nestahuje.

```
claude plugin marketplace add K3iVi/claude-nastroje
claude plugin install okna@claude-nastroje
claude plugin install hlidac-compact@claude-nastroje
```

Po instalaci restartuj Claude.

## okna — panel s přehledem oken

V každém okně ukáže panel se seznamem ostatních oken. Nahoře jsou okna, která čekají na odpověď, pracují, mají něco nepřečteného nebo jim do 15 minut končí cache (červeně). Pod nimi je, co bylo hotové za poslední týden. Klik okno otevře, „skrýt“ ho schová do jeho další aktivity. „odložit“ přesune okno, které teď počká, do sbalené sekce „Odloženo“ bez tečky. Nahoru se vrátí, až do něj něco napíšeš (compact se nepočítá), nebo tlačítkem „vrátit“. Příkaz `/okna` vypíše totéž do chatu, hodí se třeba přes Remote Control z mobilu.

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
