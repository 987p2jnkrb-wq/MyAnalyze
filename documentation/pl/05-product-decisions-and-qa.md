# Decyzje produktowe i wskazówki QA

Ten dokument rozróżnia błąd od świadomie wybranego zachowania. Zmiana poniższych zasad wymaga nowej decyzji produktowej, a nie tylko poprawki technicznej.

## Zachowania celowe

| Obszar | Decyzja |
| --- | --- |
| Import bankowy | Jest ręcznym importem CSV/PDF, nie połączeniem z bankiem. |
| Saldo po imporcie | Importowane operacje nie zmieniają salda depozytu, ponieważ saldo bankowe już je zawiera. |
| Status importu | Zaimportowane pozycje są zrealizowane. |
| Dopasowanie wpisu stałego | Sugestia wykorzystuje kierunek, kwotę i aktywny miesiąc; zgodność nazwy nie jest wymagana. |
| Transfery własne w CSV | Wszystkie zasilenia i rozpoznane transfery własne pozostają widoczne, lecz są domyślnie odznaczone. |
| Zrealizowana transakcja | Można ją usunąć, ale nie edytować. |
| Usunięcie wykonanej transakcji | Nie cofa realizacji i nie odwraca automatycznie zmiany salda; ewentualna korekta jest ręczna. |
| Usuwanie zbiorcze | Stosuje te same reguły i powiązania co usuwanie pojedyncze. Wymaga jednego potwierdzenia, a zmiana zakładki wcześniej czyści zaznaczenie. |
| Moduł transakcyjny | Jest uproszczony i pilotażowy — wspiera ręczne planowanie i import historii, a nie pełną księgowość. |
| Stałe przychody | Aplikacja przygotowuje najbliższy wpis; usunięte wystąpienie nie odtwarza się w tym samym miesiącu. |
| Podsumowanie ogólne | Sumuje wszystkie skonfigurowane wpisy stałe, niezależnie od zakresu ich dat. |
| Podsumowanie okresowe | Respektuje daty obowiązywania i konfigurowalny dzień początku okresu; historycznie rozdziela plan odtworzony od realizacji. |
| Podsumowania nad gridem | Badge’e `Dostępne`, `Rzeczywiste`, `Zadłużenie` i `Raty` pokazują podsumowanie aktywnych pozycji. Dotyczy to również widoku, w którym grid ma filtr `Wszystkie`; rekordy nieaktywne są historyczne/wyzerowane i nie powinny sztucznie wpływać na bieżące sumy. |
| Dzień wypłaty | Początek cyklu jest ustawiany w Ustawieniach planowania (domyślnie 10., zakres 1–31); koniec okresu wylicza się automatycznie. |
| Logi | Usunięcie pojedynczego logu oraz zaznaczonych logów wymaga potwierdzenia. Nie ma akcji czyszczącej automatycznie wszystkie widoczne wpisy. |
| Waluta | Jedyną dostępną walutą jest obecnie PLN. Prezentacja kwot, formularze i eksport korzystają jednak z jednej wartości zapisanej w Konfiguracji, bez powielania symbolu waluty w modułach. |
| Karta kredytowa | Limit zmienia się wyłącznie ręcznie; przelew lub wydatek zmienia wolny limit/saldo dostępne, nie limit karty. |
| Edycja produktu kredytowego | Ten sam popup i te same pola są używane w Depozytach, Zobowiązaniach i Kredytach. |
| Zobowiązania i Kredyty | Pozostają osobnymi modułami/zakładkami. Ich podobieństwo funkcjonalne nie jest obecnie powodem do łączenia widoków. |
| Gęstość akcji w gridach | Aplikacja jest mała, dlatego część akcji pozostaje dostępna bezpośrednio jako ikony lub przyciski w gridzie. Nie upraszczamy tego dodatkową warstwą menu bez konkretnego problemu użyteczności. |
| Potwierdzenia operacji | Komunikaty potwierdzające mogą pozostać krótkie i bez nazwy rekordu. Użytkownik wykonuje akcję bezpośrednio w kontekście wybranego wiersza, a rozbudowanie każdego potwierdzenia nie jest obecnie potrzebne. |
| Stały przychód | Tylko nowo generowane bieżące wpływy otrzymują typ transakcji `Zasilenie`; istniejące dane nie są masowo synchronizowane. |
| Saldo zwykłego depozytu | Użytkownik edytuje saldo dostępne, a nieaktywne saldo rzeczywiste ma mu odpowiadać. |
| Wirtualny portfel | Działa jak zwykłe konto, ale nie może być kontem spłacającym ani źródłem spłaty produktu kredytowego. |
| Szybka zmiana salda | Jedna akcja `+/−` wybiera zasilenie albo obciążenie i zapisuje zrealizowaną transakcję razem ze zmianą salda. |
| Przelew między depozytami | Zmienia salda obu depozytów i tworzy logi, ale nie tworzy osobnego przychodu ani wydatku. |
| Data szybkiego wpisu | Formularz podpowiada ostatnio używaną datę, którą można zmienić; powtórzenie wydatku podpowiada dzisiejszą datę. |
| Oznaczenie raty | Zmienia wyłącznie status i datę zapłaty; nie pobiera środków ani nie przelicza zadłużenia. |
| Harmonogram kredytu | Jest funkcją w toku; backend obsługuje PDF i raty, ale pełny import nie jest jeszcze dostępny w UI. |
| Usuwanie powiązań | Asymetria jest celowa: usunięcie produktu może posprzątać rekordy zależne, ale usunięcie raty lub depozytu zachowuje dane o długu i historię. |
| Edycja kredytu | Kredyty mają inline i modal; pozostałe proste tabele nie potrzebują dwóch przycisków edycji. |
| Przeliczanie rat | Zmiana raty albo pozostałej liczby rat ponownie podpowiada zadłużenie; późniejsza ręczna korekta samej kwoty jest dozwolona. |
| Zamknięcie formularza | Kliknięcie tła nie zamyka modala; chroni to rozpoczęte dane przed przypadkową utratą. |
| Widoki analityczne | Miesiąc, Podsumowanie i Logi są tylko do odczytu. |
| Inwestycje | Moduł został świadomie usunięty z aktywnej aplikacji. |

## Co jest błędem P0/P1

Za błąd krytyczny lub wysoki należy uznać w szczególności:

- brak uruchomienia aplikacji albo API;
- utratę danych, częściowy zapis operacji transakcyjnej lub tworzenie duplikatów;
- komunikat o sukcesie, gdy backend nie zapisał zmiany;
- niespójność powiązanych danych po odświeżeniu, np. inny wolny limit tej samej karty w Depozytach i Zobowiązaniach;
- możliwość wydania z karty więcej niż wynosi wolny limit;
- błędne wyliczenie `saldo rzeczywiste = saldo dostępne - limit`;
- brak rekordu po drugiej stronie synchronizacji Kredyty–Zobowiązania;
- brak synchronizacji raty, liczby rat, dat albo dnia spłaty między powiązanymi rekordami;
- możliwość podpięcia wirtualnego portfela pod produkt kredytowy;
- edycję zrealizowanego przychodu lub wydatku;
- import duplikatów przy ponownym wczytaniu tego samego wyciągu;
- zmianę salda depozytu przez import historii CSV/PDF;
- znikanie istniejących rekordów wskutek ukrytego filtra lub błędnej paginacji.

## Co wymaga ostrożności podczas audytu

1. **Nie oceniaj pojedynczego modułu bez relacji.** Kredyt może mieć rekord w `loans`, `debt_plans` i `wydatki_stale`, a karta także w `konta`.
2. **Po zapisie odśwież dane.** Synchronizacja jest wykonywana po stronie backendu, więc samo sprawdzenie lokalnego stanu formularza nie wystarcza.
3. **Testuj tworzenie z obu stron.** Osobno dodaj rekord z Kredytów, Zobowiązań, Stałych wydatków kategorii Kredyt i Depozytów typu karta kredytowa.
4. **Nie traktuj pustych pól jako utraty danych, jeśli rekord powstał w prostszym widoku.** Zobowiązania mają mniej informacji niż Kredyty.
5. **Przy imporcie sprawdzaj wynik na zbiorach, nie tylko liczbę wierszy.** Porównaj opis, kwotę i datę oraz uwzględnij świadomie odznaczone transfery.
6. **Nie zmieniaj zasad podsumowania przy okazji poprawki UI.** Ogólne i okresowe podsumowanie celowo liczą dane inaczej.

## Znane ograniczenia, które nie są obecnie priorytetem

- pełna obsługa EUR, USD i GBP;
- automatyczna synchronizacja bankowa;
- rozbudowana księga korekt po usunięciu zrealizowanej operacji;
- automatyczne rozpoznawanie właściciela zasilenia `Topup`;
- ukończenie interfejsu harmonogramów i importu formatów PDF;
- przywrócenie inwestycji;
- konfigurowalny dzień wypłaty i różne cykle dla wielu źródeł dochodu.

## Checklista wydania

- TypeScript backendu i frontendu kompiluje się bez błędów.
- Wszystkie testy UI/modeli oraz smoke testy API przechodzą.
- Import tego samego CSV drugi raz zgłasza duplikaty i niczego nie dopisuje.
- Import nie zmienia salda wybranego depozytu.
- Saldo i limit karty są zgodne po zmianie w Depozytach oraz Zobowiązaniach.
- Kredyt utworzony z obu widoków pojawia się po odświeżeniu w drugim widoku.
- Stały wydatek kategorii Kredyt pozostaje powiązany z ratą.
- Plan ratalny przelicza pozostałą kwotę po zmianie raty lub liczby rat zarówno w formularzu, jak i inline.
- Wirtualny portfel działa w przelewach i zmianie salda, ale nie pojawia się na liście kont spłacających.
- Zrealizowanych przychodów i wydatków nie można edytować.
- Widoki Miesiąc, Podsumowanie i Logi nie oferują edycji inline.
- Instalator uruchamia własne API bez zależności od portu pozostawionego przez środowisko deweloperskie.
