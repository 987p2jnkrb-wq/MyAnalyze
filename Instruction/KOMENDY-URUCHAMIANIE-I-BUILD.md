# MyAnalyze — uruchamianie, testy i build

Skrypty PowerShell znajdują się w głównym folderze projektu. Ustalają ścieżkę względem własnego położenia, dlatego działają również po przeniesieniu projektu na inny komputer. Najpierw używają Node.js z folderu `tools`, a jeśli go nie ma — Node.js zainstalowanego w systemie.

Uruchomienie z PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\NazwaSkryptu.ps1
```

Zmiana `ExecutionPolicy` dotyczy tylko bieżącego okna terminala.

## Dostępne skrypty

| Skrypt | Działanie |
| --- | --- |
| `RunFrontend.ps1` | Uruchamia frontend pod `http://127.0.0.1:5173`. |
| `RunBackend.ps1` | Buduje i uruchamia backend pod `http://127.0.0.1:3003`. |
| `RunFrontendBackend.ps1` | Uruchamia frontend i backend w dwóch osobnych oknach PowerShell. |
| `Stop FrontendBackend.ps1` | Zatrzymuje procesy nasłuchujące na portach 5173 i 3003. |
| `BuildElectron.ps1` | Buduje backend, frontend desktopowy i instalator Windows w folderze `dist`. |
| `RunAutotests.ps1` | Uruchamia testy interfejsu, a następnie pełny smoke test API. |
| `InstallDependencies.ps1` | Instaluje zależności projektu. Przydatny po przeniesieniu samych źródeł. |
| `start-myanalyze.ps1` | Uruchamia Electron ze źródeł; jest to tryb techniczny. |

`Scripts.Common.ps1` jest wspólnym plikiem pomocniczym i nie uruchamia się go samodzielnie.

## Typowa praca

Do testowania w przeglądarce:

```powershell
.\RunFrontendBackend.ps1
```

Do sprawdzenia i zbudowania wydania:

```powershell
.\RunAutotests.ps1
.\BuildElectron.ps1
```

Instalator wersji 1.4 ma nazwę `dist\MyAnalyze Setup 1.4.0.exe`.
