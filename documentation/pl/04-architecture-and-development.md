# Architektura i bezpieczny rozwój

## Stos technologiczny

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS i ikony Lucide.
- **Backend:** Node.js, Express i TypeScript.
- **Baza:** lokalny plik SQLite.
- **Desktop:** Electron; backend jest uruchamiany jako lokalny proces razem z aplikacją.
- **Testy:** Jest/Testing Library dla UI i modeli oraz smoke testy API dla backendu.

W trybie deweloperskim frontend działa domyślnie na `127.0.0.1:4173`, a API na `127.0.0.1:3003`. W wersji instalacyjnej Electron uruchamia własny backend, czeka na `/api/health` i dopiero wtedy otwiera interfejs.

## Dane i prywatność

Wersja desktopowa przechowuje bazę w katalogu danych użytkownika systemu Windows. Instalator dostarcza czysty szablon bazy ze schematem, bez prywatnych encji używanych podczas tworzenia aplikacji.

Aplikacja jest lokalna i offline. Importowany CSV jest przetwarzany na komputerze użytkownika; w obecnej architekturze nie ma zewnętrznego serwera ani kont użytkowników.

Plik bazy nazywa się `myanalyz.sqlite` i jest zapisywany w katalogu `userData` wyznaczanym przez Electron — na typowej instalacji Windows jest to katalog aplikacji pod `%APPDATA%`. Przy pierwszym uruchomieniu kopiowany jest czysty szablon; kolejne uruchomienia i aktualizacje nie powinny nadpisywać istniejącej bazy.

Backend przy uruchomieniu otwiera bazę, ustawia tryb WAL i timeout oraz wykonuje wyłącznie małe, idempotentne rozszerzenia schematu wymagane przez nowszą wersję. Nie przebudowuje tabel ani nie usuwa istniejących danych.

### Backup i odtworzenie danych

1. Zamknąć aplikację, aby backend zwolnił plik SQLite.
2. Skopiować `myanalyz.sqlite` z katalogu danych aplikacji do bezpiecznego miejsca.
3. Aby odtworzyć dane, przy zamkniętej aplikacji zastąpić plik w katalogu danych kopią zapasową.
4. Nie zastępować bazy plikiem `dbmigration/myanalyz.sqlite` z kodu projektu — jest to czysty szablon dla nowych instalacji.

## Wspólne elementy UI

### DataGrid

Wspólny `DataGrid` odpowiada za:

- responsywny układ i przewijanie szerokich tabel;
- sortowanie, filtrowanie i wyszukiwanie;
- wybór widocznych kolumn;
- profile układu;
- eksport CSV;
- paginację;
- opcjonalną edycję inline;
- opcjonalne akcje przypięte po prawej stronie.

Wyszukiwanie, filtry, sortowanie, widoczność i kolejność kolumn oraz profile są przechowywane lokalnie w `localStorage`, oddzielnie dla każdego grida. Nie są częścią bazy SQLite i nie przenoszą się automatycznie na drugi komputer. Eksport CSV obejmuje aktualnie widoczne kolumny; jeżeli zaznaczono rekordy, eksportuje tylko zaznaczone wiersze, a w przeciwnym razie wszystkie wiersze bieżącego wyniku po filtrach i sortowaniu.

Zasady interakcji grida:

- PPM na nagłówku kolumny oznaczonej jako filtrowalna oraz ikona filtra w tym nagłówku otwierają ten sam filtr wielokrotnego wyboru. Wiele wartości w jednej kolumnie łączy się warunkiem „lub”, a filtry różnych kolumn warunkiem „i”.
- Aktywny filtr jest widoczny jednocześnie na nagłówku kolumny i na głównym przycisku filtrów. Starsze filtry jednokrotnego wyboru zapisane w `localStorage` są automatycznie odczytywane jako wybór jednej wartości.
- Kliknięcie wiersza lub jego checkboxa ustawia punkt początkowy zaznaczenia. Shift+klik na dalszym wierszu albo checkboxie zaznacza cały zakres zgodnie z aktualnym filtrowaniem i sortowaniem. Checkbox w nagłówku zaznacza wszystkie rekordy spełniające aktualne wyszukiwanie i filtry, również na pozostałych stronach; potwierdzenie operacji pokazuje pełną liczbę zaznaczonych rekordów.
- Zbiorczy przycisk `Usuń zaznaczone (N)` pojawia się dopiero po zaznaczeniu co najmniej jednego rekordu i tylko w tabelach, które udostępniają usuwanie. Operacja wymaga jednego potwierdzenia z liczbą rekordów.
- Zbiorcze usuwanie obejmuje wyłącznie zaznaczone rekordy aktualnego wyniku. Po pełnym sukcesie zaznaczenie jest czyszczone. Przy częściowym niepowodzeniu rekordy, których nie usunięto, pozostają zaznaczone i można ponowić operację.
- Zmiana głównej zakładki albo podzakładki Managera Finansów zawsze czyści zaznaczenie wszystkich gridów. Zapobiega to wykonaniu akcji na rekordach zaznaczonych wcześniej w niewidocznym widoku.
- Zaznaczenie jest stanem chwilowym interfejsu i nie jest zapisywane w `localStorage` ani w SQLite.

Reguły biznesowe pozostają w modelu konkretnego modułu. Grid zapewnia mechanikę, ale nie powinien wiedzieć, jak wyliczać saldo karty albo zadłużenie kredytu.

Edycja inline jest włączana tylko tam, gdzie użytkownik rzeczywiście edytuje dane. Podsumowania, widok miesiąca i log aktywności są tylko do odczytu. Kredyty są wyjątkiem: oprócz inline zachowują pełny modal edycji ze względu na dużą liczbę pól.

Grid przechowuje kopię wartości początkowej edytowanego wiersza. Kliknięcie poza wierszem bez rzeczywistej zmiany zamyka edytor bez requestu API i bez komunikatu o pozornym sukcesie. Wspólne pole dziesiętne przyjmuje zarówno przecinek, jak i kropkę. Formularze kwotowe korzystają z jednej nakładki `MoneyInput`, która pokazuje kod waluty pobrany z Konfiguracji.

### Modal i nagłówek modułu

Formularze oraz potwierdzenia powinny korzystać ze wspólnego modala, a strony ze wspólnego nagłówka modułu. Nie należy tworzyć lokalnych nakładek, własnych backdropów ani osobnych wersji przycisku wstecz.

Kliknięcie zaciemnionego tła nie zamyka modala, dzięki czemu przypadkowe kliknięcie nie usuwa wprowadzonych danych. Użytkownik zamyka formularz świadomie przyciskiem `×`, **Anuluj** albo klawiszem Escape.

## Konfiguracja aplikacji

Ekran Konfiguracja korzysta ze wspólnego `DataGrid` do prezentacji języka, motywu, waluty, aliasu oraz wejścia do zarządzania modułami. Przycisk „Zapisz ustawienia” zapisuje cały zestaw lokalnie, stosuje wybrany motyw i pokazuje wspólny toast aplikacji. Domyślnym motywem jest jasny.

Zarządzanie modułami otwiera modal z drugim `DataGrid`. Konfiguracja modułów jest zapisywana przez API w SQLite i pozwala zmienić nazwę, opis, ikonę, widoczność oraz kolejność modułów strony startowej. Strona startowa i ekran konfiguracji korzystają z jednego katalogu modułów, ikon oraz jednej funkcji scalającej wartości domyślne z odpowiedzią API. Walutą możliwą do wybrania pozostaje wyłącznie PLN, ale formatery, pola kwotowe i eksport odczytują jej kod z Konfiguracji, co zostawia jedno miejsce do późniejszego rozszerzenia. Interfejs jest dostępny w języku polskim i angielskim.

## Podział odpowiedzialności

- komponenty grida renderują dane i wywołują operacje kontekstu/API;
- czyste modele (`financeSummary`, `monthViewModel`, modele kredytów) wykonują wyliczenia możliwe do testowania bez UI;
- model Celów ponownie wykorzystuje `buildPeriodSummary` do prognozy konserwatywnej, a rekomendacje i podział nowych środków pozostają czystymi funkcjami bez skutków ubocznych;
- konteksty frontendu pobierają i odświeżają wspólne zasoby;
- trasy backendu walidują żądania i wykonują operacje transakcyjne;
- wspólne walidatory kwot, dat i typów kont ograniczają powtarzanie reguł w trasach;
- realizacja wpisów stałych oraz szybkie zasilenie/obciążenie obejmują wszystkie zależne zapisy jedną transakcją SQLite;
- serwisy synchronizacji utrzymują relacje Kredyty–Zobowiązania–Stałe wydatki–Karty kredytowe;
- plan ratalny wskazuje kartę przez `debt_plans.linked_card_account_id`; spłata raty aktualizuje plan, kartę i log historii w jednej transakcji SQLite;
- log audytowy opisuje operacje w języku użytkownika.

## Zasady zmian

Przed modyfikacją reguły finansowej należy sprawdzić [Decyzje produktowe i QA](05-product-decisions-and-qa.md). Nie każda nietypowa reguła jest błędem; wiele uproszczeń zostało wybranych po to, aby aplikacja pozostała przewidywalna.

Bezpieczna kolejność pracy:

1. Opisać oczekiwane zachowanie jednym przykładem liczbowym.
2. Zlokalizować jedno źródło reguły i istniejące powiązania.
3. Dodać lub zmienić test modelu/API.
4. Wprowadzić minimalną zmianę bez równoległej logiki.
5. Uruchomić TypeScript, testy UI, testy API i build desktopowy w zależności od zakresu.
6. Sprawdzić scenariusz utworzenia rekordu z obu stron relacji, nie tylko jego edycję.

## Kierunek rozwoju

Najbezpieczniejsze kolejne usprawnienia to lepsza analiza istniejących danych, filtry i raporty oparte na tych samych encjach. Integracje z bankami, pełna wielowalutowość, automatyczne księgowanie lub rozbudowany moduł inwestycji powinny być osobnymi decyzjami produktowymi, ponieważ zmieniają prosty, lokalny charakter aplikacji.
