# Import historii bankowej z CSV i PDF

## Rola importu

Import CSV/PDF nie jest integracją z bankiem. Użytkownik sam pobiera wyciąg, wskazuje plik i zatwierdza wybrane wiersze w podglądzie.

Import służy do:

- dopisania wykonanych przychodów i wydatków do historii;
- porównania rzeczywistych operacji z planem miesiąca;
- kategoryzacji i filtrowania historii;
- ograniczenia ręcznego przepisywania wielu pozycji.

## Przebieg

### Własny układ CSV

Po wybraniu pliku panel „Dopasuj kolumny CSV” pozwala wskazać separator (automatyczny, średnik, przecinek, tabulator lub `|`), wiersz nagłówków oraz znaczenie kolumn. Wiersze są liczone po pominięciu pustych rekordów. Przykład z pierwszej operacji pomaga sprawdzić przypisanie. Wymagane są data oraz kwota ze znakiem albo osobne kolumny wpływów/wydatków; opis pozostaje opcjonalny.

Mapowanie używa istniejącego parsera i tego samego sprawdzania duplikatów, planów i transferów. Ustawienia dotyczą bieżącego pliku; nie są zapamiętywane jako profil banku. „Zastosuj i sprawdź podgląd” zastępuje wcześniejsze zmiany w podglądzie, lecz nie zapisuje transakcji. Ostateczny zapis następuje po „Importuj”.

Import oczekuje kwot w PLN niezależnie od globalnej waluty prezentacyjnej aplikacji. Przełącznik PLN/EUR/USD nie przelicza pliku ani zapisanych danych. Daty nadal wymagają formatu RRRR-MM-DD lub DD.MM.RRRR (także separator `/` lub `-` dla dat europejskich). Mapowanie nie odgaduje amerykańskiej kolejności miesiąc/dzień ani kursów walut. Prowizję należy mapować tylko, jeśli nie została już zawarta w kwocie operacji. XLSX należy wcześniej zapisać jako CSV.

### PDF z warstwą tekstową

PDF jest najpierw odczytywany do wierszy i komórek z zachowaniem ich położenia na stronie. Parser wykrywa datę, opis i kolumnę kwoty, a następnie przekazuje kandydatów do tego samego pipeline'u klasyfikacji, duplikatów, transferów i dopasowania planu co CSV. Układy rozpoznane przez adapter mogą mieć dokładniejsze opisy; pozostałe tekstowe tabele trafiają do ostrożnego parsera generycznego i wymagają sprawdzenia w podglądzie.

Parser nie korzysta z OCR. Skan bez możliwej do zaznaczenia warstwy tekstowej nie zostanie odczytany. Nie są też obsługiwane dokumenty zabezpieczone hasłem ani zestawienia, w których nie da się jednoznacznie odnaleźć daty i kwoty. Limit PDF w interfejsie wynosi 10 MB.

Treść wyciągu służy wyłącznie do przygotowania lokalnego podglądu i nie jest zapisywana w logu aktywności. Po zatwierdzeniu historia przechowuje osobne wpisy transakcji oraz krótkie podsumowanie `Import PDF` z nazwą pliku. Nazwa jest ograniczona do 120 znaków.

### Zapis transakcji

1. Import uruchamia się z akcji konkretnego depozytu.
2. Adapter CSV lub parser PDF odczytuje lokalny plik i normalizuje datę, kwotę, walutę, status, typ, opis/kontrahenta oraz instrument źródłowy.
3. Operacje oczekujące pozostają dostępne do zapisu ze statusem pending. Anulowane/odrzucone są domyślnie pominięte. Wiersze zerowe, nieprawidłowe lub w innej walucie trafiają do poprawy.
4. Kwota ujemna tworzy wydatek, a dodatnia przychód.
5. Przed pokazaniem podglądu aplikacja sprawdza twarde duplikaty na wybranym koncie oraz szuka możliwego nakładania z importami innych własnych kont.
6. Użytkownik widzi podgląd i dla każdego wiersza wybiera sposób importu: nowa wykonana operacja, rozliczenie planu lub wpisu stałego, powiązanie z już zaksięgowaną operacją, transfer własny albo pominięcie. Jedno jednoznaczne dopasowanie planu jest wybierane domyślnie, ale zawsze można je zmienić.
7. Zatwierdzone wpisy są zapisywane atomowo — cały import albo się powiedzie, albo zostanie wycofany.
8. Ponowny import tej samej istniejącej operacji do tego samego depozytu jest rozpoznawany jako duplikat również podczas zapisu. Po usunięciu przychodu lub wydatku jego fingerprint znika razem z rekordem, dlatego pozycję można ponownie zaimportować; historyczny log importu nie blokuje importu.
9. Wynik trafia do Przychodów/Wydatków oraz do logu aktywności.

Każda zapisana transakcja tworzy osobny wpis w historii konta. Taki wpis ma oznaczenie `IMPORT`, kierunek operacji, kwotę, typ transakcji i nazwę konta. Pola „Przed zmianą” oraz „Po zmianie” pozostają puste, ponieważ import nie zmienia salda. Czas pojedynczej operacji pochodzi z pliku; jeżeli wyciąg zawiera tylko datę, aplikacja używa neutralnej godziny 12:00. Osobny wpis podsumowujący cały import zachowuje rzeczywisty czas wykonania importu. Akcja szczegółów przy tym logu otwiera listę pozycji z nowego importu; starsze logi utworzone przed tą funkcją pokazują wyłącznie podsumowanie.

### Podgląd i decyzje

Podgląd importu korzysta ze wspólnego `DataGrid`. Najważniejsze pola są widoczne bezpośrednio: data, kierunek, podpisana kwota, nazwa, konto, etykieta i decyzja importu. Tabela ma wyszukiwanie, sortowanie oraz paginację, a zaznaczenie importu jest zachowywane niezależnie od bieżącej strony i filtra. Typ bankowy, kontrahent, status, udział w analizach i pozostałe dane techniczne są dostępne po rozwinięciu sekcji „Szczegóły i ustawienia”.

Jeżeli import znajdzie możliwą drugą stronę transferu, jest ona pokazana jako osobna operacja z własnym kontem, datą i kwotą. Lista kandydatów również używa `DataGrid`, więc można ją wyszukać, posortować i przejrzeć stronami. „Porównaj” otwiera wspólny modal szczegółów operacji. Samo podobieństwo nie wyłącza rekordów z analiz; cross-link jest zapisywany dopiero po potwierdzeniu importu.

## Najważniejsza reguła salda

Zaimportowane wpisy są od razu oznaczone jako zrealizowane, ale **nie zmieniają salda depozytu**. Wyciąg opisuje historię operacji, która już została uwzględniona w aktualnym saldzie pokazanym przez bank; ponowne odjęcie lub dodanie kwot zafałszowałoby saldo.

Po imporcie użytkownik nadal ręcznie ustawia aktualny stan depozytu na wartość zgodną z bankiem.

### Karta kredytowa

Import uruchomiony z depozytu typu `Karta kredytowa` korzysta z tego samego wspólnego pipeline'u. Dla eksportu zawierającego kolumny `Type, Started Date, Completed Date, Description, Amount, Fee, Balance` obowiązują następujące reguły:

- `CARD_PAYMENT` z kwotą ujemną jest wydatkiem i ma typ „Płatność kartą”;
- `CARD_REFUND`, `CARD_CHARGEBACK`, zwrot i cashback z kwotą dodatnią są zapisywane po stronie przychodów z typem „Zwrot”; dzięki temu pozostają widoczne w analizie i można je filtrować po typie;
- dodatni `TRANSFER` opisany jako `To PLN` jest traktowany jako prawdopodobna spłata/zasilenie między własnymi rachunkami: jest domyślnie importowany i pozostaje liczony do czasu potwierdzenia drugiej strony;
- używana jest data zakończenia (`Completed Date`), czyli data faktycznego wykonania operacji.

Import historii karty **nie zmienia salda dostępnego/wolnego limitu, salda rzeczywistego ani zadłużenia karty**. Te wartości już odzwierciedlają operacje widoczne na wyciągu i pozostają zarządzane tak samo jak przed dodaniem importu.

W formularzu karty można opcjonalnie wskazać **konto spłacające kartę**. Formularz otwiera akcja `Edytuj konto` przy karcie w Depozytach. Jest to stała, informacyjna relacja produktu, widoczna przy karcie i w podglądzie importu. Nie tworzy transakcji, nie wykonuje spłaty i nie zmienia żadnego salda. Sugestia cross-transakcji nadal wymaga potwierdzenia drugiej strony; może wskazywać inne własne konto zgodnie z kwotą, datą i typem instrumentu. Usunięcie konta spłacającego czyści relację, ale pozostawia kartę i jej historię.

## Nakładanie transakcji między własnymi kontami

Twarda deduplikacja nadal działa wyłącznie w obrębie wybranego depozytu i pewnego identyfikatora/fingerprintu. Dodatkowo podgląd może oznaczyć pozycję jako `Możliwe nakładanie kont`, gdy na innym własnym koncie znajduje się wcześniej zaimportowana operacja:

- o tym samym kierunku, kwocie, znormalizowanym opisie i dacie oddalonej najwyżej o jeden dzień; albo
- o przeciwnej stronie transferu, tej samej kwocie i dacie oddalonej najwyżej o dwa dni.

Sugestia transferu może dotyczyć różnych własnych kont. Dla zwykłych rachunków preferowany jest przeciwny kierunek, a dla pary konto–karta kredytowa dopuszczalny jest również ten sam kierunek, gdy operacja jest sklasyfikowana jako spłata karty. Tolerancja daty jest konfigurowalna i domyślnie wynosi ±3 dni.

Dopasowanie podobnej płatności jest tylko ostrzeżeniem: wiersz pozostaje zaznaczony do importu. Dopasowanie dwóch stron transferu własnego działa inaczej — po potwierdzeniu obie strony pozostają w historii, ale są wyłączone z analizy, aby nie tworzyć sztucznego przychodu i wydatku. Relacja jest zapisana jako `transaction A ↔ transaction B` typu `OWN_TRANSFER`; może być potwierdzona automatyczną sugestią albo wskazana ręcznie z listy operacji innych kont.

## Duplikat, transfer i rozliczenie planu

Są to trzy niezależne wyniki analizy, mimo że podgląd pokazuje je w jednej kolumnie `Sposób importu`:

- deduplikacja odpowiada wyłącznie na pytanie, czy ten sam wiersz bankowy był już importowany;
- wykrywanie transferu podpowiada, że operacja przesuwa własne środki i powinna pozostać poza budżetem;
- dopasowanie planu wskazuje niezrealizowany wpis jednorazowy albo konkretne wystąpienie wpisu stałego.

Dopasowanie wymaga zgodnego kierunku i korzysta przede wszystkim z kwoty, daty oraz konta. Nazwa i kategoria są tylko pomocnicze. Częściowy wpływ lub wydatek może rozliczyć część planu, a kolejne importy mogą rozliczać jego resztę. Gdy istnieje dokładnie jedna wiarygodna możliwość, jest wybrana domyślnie; przy kilku podobnych kandydatach aplikacja nie zgaduje.

Import może też wskazać już zrealizowaną ręcznie operację na tym samym koncie. Wtedy nie powstaje drugi przychód ani wydatek — istniejący rekord otrzymuje identyfikator importu i staje się odporny na ponowne wczytanie tego samego wiersza.

Fundamentalna reguła: **plan okresu nie zmienia się przez import**. Import zasila wykonanie, a prognoza uwzględnia tylko nierozliczoną część powiązanego planu. Powiązanie nie wykonuje transferu, nie zmienia salda i nie usuwa planowanej operacji.

## Transfery własne i zasilenia

W rozszerzonym modelu eksportu bankowego wszystkie operacje typu `Topup` oraz rozpoznane transfery między własnymi rachunkami są domyślnie importowane i liczone w budżecie. Dopiero potwierdzenie drugiej strony transferu wyłącza obie operacje z analiz.

To świadomy kompromis: bez bezpośredniej integracji z bankiem i bez danych właściciela nie da się niezawodnie odróżnić transferu między własnymi rachunkami od wpływu zewnętrznego. Bezpieczniej zachować pozycję w historii i nie zawyżyć analizy niż automatycznie uznać każde zasilenie za dochód.

## Obsługiwane założenia formatu

Parser obsługuje pliki rozdzielane przecinkiem, średnikiem albo tabulatorem, pola w cudzysłowach, kodowanie UTF-8 z awaryjnym odczytem Windows-1250, polski i angielski zapis dat oraz kwoty z kropką albo przecinkiem dziesiętnym.

Podstawowy CSV musi zawierać co najmniej datę i kwotę albo osobne kolumny obciążenia i uznania. Opis nie jest wymagany. Nazwa transakcji korzysta z fallbacku: `Opis → Odbiorca/Zleceniodawca → Rodzaj transakcji → Operacja bankowa`. Wspierany rozszerzony model eksportu może zawierać kolumny:

`Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance`.

Plik przygotowany według akcji „Generuj wytyczne dla GPT” powinien używać kompletnego nagłówka:

`Date;Amount;Currency;Description;Counterparty;Type;Status;Transaction ID;Account`

Akceptowany jest również zgodny wariant polskojęzyczny z kolumnami `Data`, `Kwota` i `Instrument`. `Account`/`Instrument` oznacza instrument źródłowy wyciągu, a nie rachunek docelowy wspomniany w opisie. Generator wymaga zwykłego CSV bez tabel Markdown, bloków kodu i komentarzy. Nie należy dopisywać nieistniejących operacji ani identyfikatorów; identyczne wiersze pozostają osobnymi wystąpieniami.

W takim pliku aplikacja korzysta przede wszystkim z daty zakończenia operacji, znaku kwoty, waluty, statusu i typu transakcji. Do importu przechodzą operacje zakończone, a wpisy oczekujące, cofnięte, odrzucone lub anulowane są pomijane. Format nie jest traktowany jako integracja z konkretną instytucją — jest po prostu przyjętym modelem CSV.

Jeżeli plik zawiera identyfikator operacji, np. `Transaction ID` albo `ID transakcji`, jest on używany jako najpewniejsza podstawa deduplikacji. Bez takiej kolumny fingerprint jest rozszerzany o liczność wystąpienia. Przykładowo cztery identyczne rekordy tworzą cztery importowalne wystąpienia; kolejny import z pięcioma doda tylko piąte. Powtórzenia bez ID są oznaczone ostrzeżeniem, ale pozostają zaznaczone.

Limit CSV w interfejsie wynosi 5 MB, limit PDF 10 MB, a jedno żądanie API może zawierać maksymalnie 5 000 transakcji.

## Celowe zabezpieczenia

- podgląd i ręczne zaznaczenie przed zapisem;
- blokada przycisku podczas importu;
- zapis transakcyjny w SQLite;
- odrzucenie nieprawidłowej daty, kwoty lub identyfikatora źródłowego;
- unikalny fingerprint wiersza dla danego depozytu;
- sprawdzenie wcześniej zaimportowanych operacji przed zatwierdzeniem;
- ostrożna sugestia nakładania z importami innych własnych kont;
- oznaczenie powtórzonych operacji wewnątrz pliku;
- brak częściowo zapisanego importu po błędzie;
- brak zmiany salda depozytu, wolnego limitu i zadłużenia karty.
