# Wspólny DataGrid — model i granice odpowiedzialności

## Cel

`DataGrid` jest wspólnym mechanizmem prezentowania list w aplikacji. Zapewnia spójny wygląd i zachowanie tabel, ale nie zawiera reguł finansowych ani wywołań API konkretnych modułów.

Moduł domenowy odpowiada za dane, zapis i znaczenie kolumn. Grid odpowiada wyłącznie za obsługę tabeli.

## Podział kodu

- `myanalyze-frontend/src/components/DataGrid.tsx` — komponent koordynujący tabelę: paginacja, zaznaczanie, edycja inline i renderowanie wierszy.
- `myanalyze-frontend/src/components/data-grid/types.ts` — publiczny kontrakt `DataGridProps<T>`, `DataGridColumn<T>`, widoki i profile.
- `myanalyze-frontend/src/components/data-grid/model.ts` — czyste funkcje: normalizacja filtrów, zgodność zapisanych układów, porównywanie oraz komórki CSV.
- `myanalyze-frontend/src/components/data-grid/useDataGridView.ts` — stan widoku: wyszukiwanie, filtry, sortowanie, kolejność i widoczność kolumn, profile oraz zapis w `localStorage`.
- `myanalyze-frontend/src/hooks/useResizableColumns.ts` — zmiana szerokości kolumn i zapis szerokości.

Publiczne importy pozostają kompatybilne:

```ts
import DataGrid, { type DataGridColumn } from "../../components/DataGrid";
```

## Odpowiedzialność wspólnego grida

Grid może realizować funkcje, które mają takie samo znaczenie we wszystkich tabelach:

- wyszukiwanie, filtrowanie i sortowanie;
- paginację;
- widoczność, kolejność i szerokość kolumn;
- profile widoku zapisane lokalnie;
- eksport widocznych danych do CSV;
- zaznaczanie oraz grupowe usuwanie, jeśli moduł przekaże operację usunięcia;
- techniczny przebieg edycji inline: rozpoczęcie, draft, walidację przekazaną przez moduł i wywołanie zapisu;
- wspólny układ nagłówka, wierszy, akcji i stopki.

## Odpowiedzialność modułu domenowego

Każdy ekran korzystający z grida zachowuje u siebie:

- pobieranie danych i obsługę API;
- reguły biznesowe oraz walidację danych;
- definicje kolumn, formatowanie kwot, dat i statusów;
- decyzję, które pola są edytowalne;
- formularze dodawania i bardziej rozbudowane modale edycji;
- akcje właściwe tylko danemu rekordowi;
- lokalne elementy UI, które nie są ogólną funkcją tabeli.

Przykład: konfiguracja modułów korzysta z `DataGrid` do renderowania, edycji nazwy i opisu oraz wspólnego układu. Wybór ikony pozostaje lokalnym selektorem konfiguracji. Nie został dodany do rdzenia grida, ponieważ inne moduły go nie potrzebują.

Kolumna może przekazać stałe `filterOptions`, jeśli poprawna wartość filtra ma być dostępna również wtedy, gdy aktualny zestaw danych jej nie zawiera. Przychody i wydatki używają tego dla statusów „Zaplanowane” i „Zrealizowane”, dzięki czemu pusty widok zaplanowanych pozycji nie przełącza użytkownika samoczynnie na historię.

## Reguła rozbudowy

Nowa opcja powinna trafić do `DataGrid` tylko wtedy, gdy:

1. ma takie samo znaczenie w kilku modułach;
2. nie wymaga znajomości modelu finansowego lub konkretnego endpointu;
3. da się opisać generycznym kontraktem typów;
4. posiada test chroniący wspólne zachowanie.

Funkcja potrzebna jednemu mało istotnemu ekranowi powinna pozostać w tym ekranie. Nie należy dodawać warunków sprawdzających `gridId` ani nazwę modułu wewnątrz wspólnego grida.

## Konfiguracja modułów

`ModulesConfigTable` używa wspólnego grida bez specjalnych rozszerzeń:

- nazwa i opis — standardowa edycja inline;
- widoczność — własny renderer komórki i istniejący endpoint konfiguracji;
- kolejność — standardowe akcje wiersza;
- ikona — lokalny selektor wyświetlany ponad modalem, aby nie był przycinany przez przewijany obszar tabeli;
- kolejność rekordów — `preserveRowOrder`, ponieważ jest znaczeniem biznesowym konfiguracji, a nie sortowaniem widoku.

Zmiana kolejności wysyła całą sekwencję jednym requestem i zapisuje ją w jednej transakcji SQLite. W razie błędu interfejs przywraca wcześniejszą, niemutowaną kolejność, a baza nie pozostaje z częściowo zmienioną kolejnością.

## Ochrona przed regresją

Testy `DataGrid.test.tsx` chronią między innymi:

- edycję inline oraz zapis po kliknięciu poza wiersz;
- filtry, wyszukiwanie i zgodność starszych zapisanych układów;
- rozłączne panele konfiguracji grida;
- zaznaczanie, zakresy i grupowe usuwanie;
- blokowanie zaznaczenia chronionych rekordów;
- sortowanie bez mutowania danych źródłowych;
- paginację;
- zapisywanie i ponowne stosowanie profili.

Testy `ModulesConfigTable.test.tsx` dodatkowo chronią:

- użycie wspólnego grida w konfiguracji;
- zapis nazwy przez edycję inline;
- przełączanie widoczności;
- atomowy zapis całej kolejności modułów.

Po zmianie wspólnego grida należy uruchomić cały zestaw testów frontendu, TypeScript, ESLint oraz produkcyjny build. Sam test pojedynczego modułu nie wystarcza, ponieważ `DataGrid` jest współdzielony przez wiele ekranów.
