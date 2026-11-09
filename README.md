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

Claude drží kontext okna hodinu v prompt cache. Když se k velkému oknu vrátíš později, `/compact` (ruční i automatický) přečte celé okno znovu za plnou cenu. Hlídač to udělá ještě s platnou cache.

**Od verze 2.0 hlídá přímo v okně** a stačí plugin nainstalovat. Když je okno nad 150k tokenů 50 minut po posledním tahu nečinné (v Orce nastav „Stop idle agents after“ na 1 h nebo víc, jinak Orca chat po 30 min ukončí i s hlídačem), plugin v něm spustí `/compact`. Funguje v Claude desktop, v terminálu i v chatu [Orca](https://github.com/stablyai/orca), kam zvenku nic napsat nejde. Když PC mezitím spalo a od tahu uběhla přes hodinu, nedělá nic, protože cache už vypršela. Okno při compactu ukáže řádek „hlídač compactu: …“. Plugin hlídá jen okna spuštěná po instalaci nebo po `/reload-plugins`.

### Starší varianta: Plánovač úloh (jen Claude desktop na Windows)

Okno otevře, napíše do něj `/compact` a vrátí tě do okna, kde jsi byl. S pluginem 2.0 ji nepotřebuješ. Kdybys měl obě, zkompaktuje okno ta, která přijde dřív. Instalace: v Claude napiš `/hlidac-compact` nebo „nainstaluj hlídač compactu“. Claude vysvětlí, co hlídač dělá, a nejdřív ho nainstaluje na sucho, kdy hlídač jen zapisuje do logu.

- **Když na PC pracuješ,** počká. Při doteku během zásahu ustoupí.
- **Když to do 55. minuty nestihne,** ukáže oznámení Windows s odkazem na okno.
- **Displej může být zhasnutý.** PC ale nesmí spát ani být zamčené.
- **Firemní PC** může PowerShell skripty, Plánovač nebo SendKeys zakazovat. Pak je potřeba schválení od IT.

## Upozornění

Oba pluginy čtou interní soubory aplikace Claude, které nejsou veřejné rozhraní. Aktualizace Claude je může rozbít. Vyzkoušeno na Windows 11 s Claude desktop z Microsoft Store, listopad 2026.

Licence MIT.
