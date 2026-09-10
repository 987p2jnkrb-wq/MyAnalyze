# Cel i zakres aplikacji

## Cel

MyAnalyze ma być prostszą i przyjemniejszą w użyciu wersją osobistego arkusza `BudgetPlaner`. Sercem aplikacji jest **Manager Finansów**, w którym można szybko przełączać się między danymi bez otwierania wielu osobnych modułów.

Priorytety produktu:

- szybkie ręczne aktualizowanie stanu finansów;
- czytelne rozróżnienie planu i wykonania;
- proste prognozy bez automatycznego księgowania wszystkiego;
- lokalne przechowywanie danych i działanie offline;
- mało wyjątków w UI oraz jeden współdzielony grid i modal;
- przewidywalność ważniejsza niż rozbudowana automatyzacja.

## Główne widoki

Na stronie startowej pozostają trzy moduły:

- **Manager Finansów** — główny obszar pracy;
- **Logi aplikacji** — historia zmian i operacji;
- **Konfiguracja** — nazwy, opisy, ikony, widoczność i kolejność modułów strony startowej.

Manager Finansów zawiera zakładki:

| Zakładka | Odpowiedzialność |
| --- | --- |
| Depozyty | Konta bankowe, gotówka, wirtualne portfele i karty kredytowe oraz ich bieżące salda. |
| Przychody | Podzakładki **Bieżące** dla pojedynczych wpływów oraz **Stałe** dla reguł cyklicznych. |
| Wydatki | Podzakładki **Bieżące** dla pojedynczych kosztów oraz **Stałe** dla reguł cyklicznych. |
| Zobowiązania | Lekkie zestawienie długów, rat i kart kredytowych. |
| Kredyty | Szczegółowe dane produktów kredytowych i harmonogramów. |
| Cele | Realna płynność, finansowa podłoga, cele użytkownika, rekomendacje i kalkulator nowych środków. |
| Podsumowanie | Podzakładki **Ogólne**, **Okres**, **Miesiąc** i **Historia**: sytuacja finansowa, prognoza bieżącego okresu wypłatowego, odtworzenie planu i realizacji dawnych okresów, plan i wykonanie miesiąca oraz ręczne snapshoty stanu. |

## Świadome granice produktu

MyAnalyze nie jest systemem bankowym ani księgowym. Nie ma logowania do banku, synchronizacji rachunku w tle, Open Banking ani automatycznego uzgadniania sald.

Poza aktualnym zakresem są również:

- pełna obsługa wielu walut — podstawowym trybem pozostaje PLN;
- automatyczne księgowanie wypłaty i wszystkich wpisów stałych;
- rozbudowany silnik reguł, księga korekt i odwracanie każdej operacji;
- moduł inwestycji — został celowo usunięty, aby skupić produkt na budżecie domowym;
- odrębne strony dla kont, przychodów, wydatków i kredytów — funkcje są skupione w Managerze Finansów;
- chmurowa synchronizacja danych między komputerami.

## Model pracy

Aplikacja opiera się na ręcznym sterowaniu. Użytkownik decyduje, kiedy zmienić saldo, kiedy uznać wpis za zrealizowany i które pozycje z pliku bankowego zaimportować. Automatyzacje mają ograniczać powtarzalne wpisywanie danych, ale nie podejmować decyzji finansowych za użytkownika.

Moduł transakcyjny jest świadomie uproszczony i ma charakter pilotażowy. Służy przede wszystkim do ręcznego planowania oraz przeglądania historii zaimportowanej z banku, a nie do prowadzenia pełnej księgi rachunkowej z automatycznymi korektami i storniami.
