# Reguły biznesowe

## 1. Depozyty

Depozyt może reprezentować:

- zwykłe konto bankowe;
- gotówkę;
- wirtualny portfel;
- kartę kredytową.

Dla zwykłego konta, gotówki i wirtualnego portfela użytkownik edytuje **saldo dostępne**. Saldo rzeczywiste jest nieaktywne i ma odpowiadać saldu dostępnemu; nie jest drugim niezależnym polem do ręcznego prowadzenia. Edycja odbywa się bezpośrednio w komórce wspólnego grida, a kliknięcie poza edytowanym wierszem zapisuje zmianę tylko wtedy, gdy wartość rzeczywiście się zmieniła.

Wirtualny portfel ma te same reguły salda, przelewów, importu i szybkiej zmiany salda co zwykłe konto. Nie może jednak zostać wskazany jako konto spłacające kartę ani jako źródło spłaty raty kredytu, kredytu hipotecznego, długu lub planu ratalnego. Typy depozytów mają stonowane, stałe oznaczenia: konto neutralne, gotówka zielona, wirtualny portfel niebieski, karta kredytowa bursztynowa.

Akcja `+/−` otwiera jeden formularz zmiany salda z przełącznikiem **Zasilenie / Obciążenie**. Operacja zmienia saldo i atomowo zapisuje odpowiednio zrealizowany przychód albo wydatek. Kwoty można wpisywać z kropką lub przecinkiem dziesiętnym.

### Karta kredytowa

Karta kredytowa łączy zakładkę **Depozyty** z odpowiadającym jej wpisem w **Zobowiązaniach**. Reguły są następujące:

- `limit karty` jest wartością ustawianą ręcznie i nie zmienia się podczas przelewów ani realizacji wydatków;
- `wolny limit` w Zobowiązaniach jest tym samym co `saldo dostępne` karty w Depozytach;
- `saldo rzeczywiste` karty jest wyliczane jako `saldo dostępne - limit karty`;
- przykładowo przy limicie 3 000 zł i wolnym limicie 115,21 zł saldo rzeczywiste wynosi -2 884,79 zł;
- wydatek z karty nie może przekroczyć jej wolnego limitu;
- przy nazwie karty w gridzie depozytów wyświetlany jest badge z limitem karty;
- karta może opcjonalnie wskazywać zwykłe konto lub gotówkę jako `konto spłacające`; wirtualny portfel jest wykluczony. Relacja jest informacyjna, wspiera analizę importu i nie wykonuje przelewu ani nie zmienia sald;
- karta nie może wskazywać samej siebie ani innej karty, a usunięcie wskazanego konta czyści wyłącznie relację;
- karta jest tworzona w jednym miejscu — w formularzu **Zobowiązań**; formularz zawiera tylko nazwę, dostępny limit i limit karty, a wykorzystany limit jest wyliczany;
- po zapisie karta automatycznie pojawia się jako pozycja tylko do odczytu w **Kredytach** oraz jako dostępne środki w **Depozytach**;
- w Depozytach można edytować nazwę, wolny limit i opcjonalne konto spłacające, ale nie można utworzyć ani zmienić zwykłego konta w kartę;
- źródłem danych produktu pozostają Zobowiązania, co zapobiega powstawaniu dwóch niezależnych rekordów tej samej karty.

### Przelewy między depozytami

Przelew jest ręcznym przesunięciem środków między dwoma depozytami:

- depozyt źródłowy i docelowy muszą być różne;
- kwota musi być dodatnia i nie może przekraczać salda dostępnego źródła;
- saldo dostępne i rzeczywiste źródła są zmniejszane o kwotę przelewu;
- saldo dostępne i rzeczywiste celu są zwiększane o tę samą kwotę;
- limit karty kredytowej nie zmienia się;
- przelew nie tworzy automatycznie osobnego przychodu i wydatku;
- w logu powstaje operacja wychodząca dla źródła i przychodząca dla celu.

W przypadku karty kredytowej zmiana wolnego limitu powoduje taką samą zmianę salda rzeczywistego, dzięki czemu nadal obowiązuje wzór `saldo rzeczywiste = saldo dostępne - limit`.

### Historia depozytu

Z poziomu wiersza depozytu można otworzyć jego historię. Modal korzysta ze wspólnego grida, pozwala ograniczyć zakres dat oraz wyeksportować widoczną historię do CSV. Pokazuje zmiany salda i typu depozytu, przelewy, realizacje oraz importy powiązane z tym depozytem.

## 2. Przychody i wydatki

Zakładki Przychody i Wydatki uruchamiają się z aktywnym filtrem `Zaplanowane`. Zrealizowane wpisy pozostają dostępne po zmianie albo wyczyszczeniu filtra, ale domyślnie nie zasłaniają bieżącego planu.

Nowy wpis jest domyślnie **zaplanowany**. Realizacja wymaga wyboru depozytu:

- realizacja przychodu zwiększa saldo depozytu;
- realizacja wydatku zmniejsza saldo depozytu;
- zrealizowany wpis można usunąć, ale nie można go edytować;
- usunięcie zrealizowanego wpisu nie cofa jego realizacji i nie wykonuje automatycznej korekty salda — jest to świadome uproszczenie produktu;
- szybkie dodawanie tworzy zwykły wpis planowany i samo nie zmienia salda.

Przychody i wydatki tworzą uproszczony, pilotażowy moduł transakcyjny przeznaczony do ręcznego zarządzania oraz importowania historii. Nie jest to pełna księga rachunkowa: usunięcie rekordu oznacza usunięcie go z analizy, natomiast ewentualną korektę bieżącego salda użytkownik wykonuje ręcznie w Depozytach.

Zaimportowana transakcja pokazuje w UI oznaczenie `IMPORT` oraz konto, z którego wczytano historię. Informacja ta nie jest przypisywana do zwykłych ręcznych wpisów.

Zaimportowany transfer własny może być zapisany jako zrealizowany przychód lub wydatek techniczny, ale ma oznaczenie `Poza analizą` dopiero po potwierdzeniu powiązania z drugą operacją. Pozostaje widoczny i filtrowalny w historii, natomiast nie zwiększa planu, wykonania miesiąca ani sum przychodów i wydatków. Zwykły import zewnętrznej płatności wchodzi do wykonania miesiąca, ale sam import nie tworzy planu.

Cross-link `OWN_TRANSFER` jest relacją dwóch istniejących operacji należących do różnych własnych depozytów. Nie usuwa ani nie tworzy operacji i nie zmienia sald depozytów. System może zasugerować parę na podstawie kwoty, daty (domyślnie ±3 dni), kierunku i typu instrumentu, ale użytkownik może ją ręcznie wskazać, zmienić albo odrzucić. Dla zwykłych kont najczęstszy jest układ wydatek ↔ przychód; przy karcie kredytowej dopuszczalny jest także wydatek ↔ wydatek, jeśli operacja wskazuje na spłatę karty.

Typ transakcji (np. płatność kartą, przelew wychodzący, zasilenie, spłata kredytu) służy do opisu, filtrowania i analizy. Kierunek kwoty decyduje, czy wpis trafia do przychodów, czy wydatków.

### Szybkie dodawanie

Szybkie dodawanie tworzy planowany przychód albo wydatek bez otwierania pełnego formularza. Zapamiętuje ostatni rodzaj wpisu, kategorię, datę i maksymalnie trzy ostatnio używane kategorie osobno dla przychodów oraz wydatków.

Zapamiętana data jest tylko wartością początkową formularza i użytkownik może ją zmienić przed zapisem. Funkcja **Powtórz ostatni wydatek** kopiuje nazwę, kwotę i kategorię ostatniego wydatku, ale podpowiada bieżącą datę.

## 3. Stałe przychody

Stały przychód opisuje nazwę, kwotę, kategorię, zakres obowiązywania i dzień miesiąca. Aplikacja utrzymuje jeden najbliższy planowany wpis jednorazowy wynikający z reguły.

- Dzień wystąpienia jest ograniczany do ostatniego dnia krótszego miesiąca.
- Po minięciu bieżącej daty przygotowywane jest następne miesięczne wystąpienie.
- Usunięcie wygenerowanego wpisu oznacza pominięcie tego konkretnego wystąpienia; nie jest ono odtwarzane w pętli.
- Ręczna zmiana wygenerowanego wpisu odłącza go od automatycznej aktualizacji tej instancji.
- Widok miesiąca nie liczy wygenerowanego wpisu drugi raz obok reguły stałej.

## 4. Stałe wydatki

Stały wydatek działa jak reguła cyklicznego kosztu. Może mieć datę końcową albo być bezterminowy.

Kategoria **Kredyt** ma znaczenie integracyjne: taki wpis może być powiązany z pozycją w Zobowiązaniach i z kredytem. Kwota stałego wydatku jest wtedy miesięczną ratą, a daty oraz dzień miesiąca opisują okres i termin płatności.

Realizacja stałego przychodu albo wydatku jest atomowa: aktualizacja salda, utworzenie zrealizowanej transakcji i zapis logu powodzą się razem albo są wycofywane. Ponowne wysłanie tej samej realizacji jest odrzucane, aby nie zaksięgować wpisu dwa razy.

## 5. Zobowiązania i Kredyty

To dwa różne widoki tego samego obszaru, a nie jeden scalony formularz:

- **Zobowiązania** — uproszczony widok do planowania: produkt, typ, kapitał/zadłużenie, rata, liczba rat, wolny limit i limit;
- **Kredyty** — szczegółowy rekord: daty, kapitał, aktualne zadłużenie, rata, liczba rat, dzień spłaty, RRSO, oprocentowanie, prowizja i ubezpieczenie.

Rekord utworzony w jednym z tych widoków powinien pojawić się także w drugim. Jeżeli powstał w prostszym widoku, pola szczegółowe mogą pozostać puste do późniejszego uzupełnienia.

### Typy i wyliczenia

- **Dług** i **Inne** — zadłużenie pozostaje wartością ręczną również w edycji inline.
- **Kredyt** — formularz podpowiada zadłużenie jako `pozostała liczba rat × kwota raty`. Ręczna korekta jest zachowana do czasu zmiany raty albo liczby rat; taka zmiana świadomie wylicza nową podpowiedź.
- **Kredyt hipoteczny** — zadłużenie/kapitał może być podawane ręcznie; nie należy nadpisywać go prostym iloczynem rat.
- **Karta kredytowa** — korzysta z limitu i wolnego limitu; pola limitów nie dotyczą pozostałych typów.
- **Plan ratalny** — prosty produkt 0% powiązany z jedną kartą kredytową. Pozostała kwota jest podpowiadana jako `rata × pozostała liczba rat`, także podczas edycji formularza i inline, a następnie może zostać ręcznie skorygowana. Plan przechowuje również informacyjną opłatę jednorazową.
- Przy dodawaniu kredytu data rozpoczęcia i łączna liczba rat wyznaczają liczbę rat, które już minęły. Formularz proponuje liczbę pozostałą, najbliższą ratę i datę końcową, ale pozwala poprawić liczbę pozostałych rat.
- Data końcowa jest wyliczana z najbliższej niezapłaconej raty, pozostałej liczby rat i dnia spłaty; backend ponownie wykonuje obliczenie podczas zapisu.
- Data dodania jest ustawiana automatycznie.
- Utworzenie kredytu lub zobowiązania z ratą powinno utworzyć/powiązać stały wydatek kategorii **Kredyt**.

### Plan ratalny karty

- Plan dodaje się i edytuje w **Zobowiązaniach**; w **Kredytach** jest widoczny tylko do odczytu.
- Kwota planu jest już zawarta w saldzie bankowym karty. Dodanie planu nie zmienia salda ani wolnego limitu i nie może podwójnie zwiększać łącznego zadłużenia.
- Dla karty interfejs pokazuje saldo bankowe oraz kwotę zadłużenia poza planami: `saldo rzeczywiste + pozostałe kwoty planów`.
- Akcja **Spłać ratę** wymaga wyboru zwykłego konta lub gotówki; wirtualny portfel nie może finansować produktu kredytowego. Operacja atomowo obciąża wybrane konto, zmniejsza pozostałą kwotę i liczbę rat planu oraz o tę samą kwotę zwiększa wolny limit i saldo rzeczywiste karty. Ostatnia rata może być niższa od raty standardowej.
- Wybrane konto zostaje zapamiętane jako konto spłacające kartę i jest domyślnie proponowane przy następnej racie.
- Każda spłata tworzy wpis historii zarówno dla obciążonego konta, jak i powiązanej karty. Po spłacie całości powiązany stały wydatek zostaje usunięty.
- Opłata jednorazowa jest informacyjna i nie jest ponownie dodawana do salda, ponieważ znajduje się już w zadłużeniu raportowanym przez bank.
- Karta może opcjonalnie przechowywać datę rozpoczęcia i oprocentowanie; pola nie są wymagane do codziennej obsługi.

Pole źródła w Zobowiązaniach informuje o rekordzie utworzonym przez **Kredyty**, **Depozyty** albo **Stałe wydatki**. Dla zobowiązania utworzonego bezpośrednio w zakładce Zobowiązania źródło pozostaje puste — nie należy prezentować sztucznej wartości „Umowa”.

Kredyty mają zarówno edycję pojedynczych pól inline, jak i pełną edycję w modalu. Jest to celowy wyjątek od pozostałych gridów ze względu na liczbę powiązanych pól.

Produkty kredytowe korzystają z jednego formularza edycji niezależnie od miejsca otwarcia. Karta otwarta z Depozytów, Zobowiązań lub Kredytów pokazuje te same pola karty; analogicznie kredyt i plan ratalny mają jeden zestaw pól właściwy dla swojego typu.

### Harmonogram rat — funkcja w toku

Harmonogram przechowuje termin, część kapitałową, odsetki i status każdej raty. Użytkownik może ręcznie oznaczyć ratę jako opłaconą; operacja ustawia status i datę zapłaty, ale **nie pobiera środków z depozytu, nie zmniejsza zadłużenia i nie zmienia liczby rat**. Takie zachowanie jest celowe na obecnym etapie uproszczonego modułu transakcyjnego.

Backend posiada mechanizm odczytu harmonogramu z PDF oraz pobierania zapisanego dokumentu, lecz cały przepływ importowania PDF nie jest jeszcze udostępniony i dopracowany w interfejsie. Harmonogram należy traktować jako **work in progress**, a nie kompletny moduł rozliczania kredytu.

### Celowa asymetria usuwania

Powiązane rekordy nie zawsze są usuwane symetrycznie:

- usunięcie Zobowiązania usuwa odpowiadający Kredyt i powiązany stały wydatek;
- usunięcie Kredytu usuwa powiązane Zobowiązanie oraz technicznie utworzony stały wydatek;
- usunięcie stałego wydatku kategorii **Kredyt** odłącza ratę, ale pozostawia Kredyt i Zobowiązanie, aby nie utracić danych o długu;
- usunięcie depozytu będącego kartą usuwa czysto techniczne Zobowiązanie albo odłącza konto od rekordu, który ma również inne źródło danych;
- usunięcie depozytu nie usuwa historycznych przychodów i wydatków zaimportowanych z jego wyciągu.

Ta asymetria jest celowa: usunięcie nadrzędnego produktu może posprzątać elementy utworzone razem z nim, natomiast usunięcie pomocniczej raty lub depozytu nie powinno automatycznie usuwać informacji o istniejącym długu ani historii analitycznej.

## 6. Miesiąc

Widok **Miesiąc** jest tylko do odczytu i pokazuje plan oraz wykonanie dla wybranego miesiąca.

- Plan zawiera ręcznie dodane wpisy z danego miesiąca oraz wystąpienia aktywnych reguł stałych; historia zaimportowana z CSV nie tworzy planu.
- Wpis zrealizowany nadal należy do planu, a dodatkowo jest liczony w wykonaniu.
- Wpis wygenerowany ze stałego przychodu nie zwiększa planu drugi raz.
- Wykonanie obejmuje wpisy oznaczone jako zrealizowane, w tym historię zaimportowaną z CSV, z wyjątkiem pozycji jawnie oznaczonych jako `Poza analizą`.
- Wyniki są grupowane według kategorii i pokazują różnicę między planem a wykonaniem.

## 7. Podsumowanie

Podsumowanie jest tylko do odczytu i ma dwa konteksty:

### Ogólne

- środki własne — saldo rzeczywiste depozytów bez kart kredytowych;
- stałe wpływy i stałe wydatki — sumy z reguł stałych;
- dodatkowe wpływy i wydatki — niezrealizowane wpisy jednorazowe;
- środki dostępne z kartą — suma sald dostępnych wszystkich depozytów;
- budżet dzienny — środki dostępne podzielone przez liczbę dni do kolejnej wypłaty.

### Okresowe

Początek okresu wypłatowego jest ustawiany w **Ustawieniach planowania** (domyślnie 10. dzień miesiąca), a koniec przypada dzień przed kolejnym początkiem. Widok bieżącego okresu uwzględnia planowane operacje i wystąpienia wpisów stałych oraz wylicza estymowane saldo na wskazany dzień.

Widok rozdziela środki rzeczywiste od dostępnych. Dla wybranego dnia pokazuje **Rzeczywiste środki / saldo** oraz analogiczne **Dostępne środki / saldo**, przy czym wartości dostępne uwzględniają dostępne limity kart. Dzień bieżący nie dolicza ponownie operacji, które są już zawarte w aktualnym saldzie; przyszłe dni uwzględniają operacje przypadające do wybranej daty.

Strzałki pozwalają przejść do wcześniejszych okresów. Ich plan jest odtwarzany z datowanych wpisów jednorazowych i zakresów reguł stałych, a wykonanie wyłącznie ze zrealizowanych transakcji. Historyczna płynność, zadłużenie i stan Celów są pokazywane tylko wtedy, gdy użytkownik zapisał snapshot dla danego okresu; aplikacja nie odtwarza ich z dzisiejszych sald.

## 8. Log aktywności

Log jest widokiem audytowym, bez edycji inline. Pokazuje typ operacji, moduł, stan przed i po zmianie oraz czytelny komentarz. Pojedynczy wpis można usunąć z jego wiersza, a wiele wpisów po ich zaznaczeniu. Obie operacje wymagają potwierdzenia; ekran nie udostępnia akcji usuwającej automatycznie wszystkie widoczne logi.

Techniczne nazwy modułów, pól i wartości są tłumaczone na język użytkownika. Dotyczy to między innymi typów kont (`konto`, `gotowka`, `karta_kredytowa`, `wirtualny_portfel`), konta spłacającego i powiązanej karty. Wartości `0/1` są interpretowane jako „nie/tak” tylko dla pól logicznych; numery identyfikacyjne pozostają identyfikatorami.

## 9. Zbiorczy eksport CSV

Przycisk **Pobierz CSV** na końcu paska zakładek Managera tworzy jeden plik z kolumną `Sekcja`. Eksport obejmuje aktualne stany kont, stałe wydatki, stałe przychody, niezrealizowane przychody i wydatki zaplanowane oraz zobowiązania. Dla karty zadłużenie nie dubluje osobno wykazanego planu ratalnego.

## 10. Cele

Cele są warstwą analityczną i nie wykonują przelewów ani księgowań. `Realna płynność` obejmuje salda rzeczywiste kont, gotówki i wirtualnych portfeli, ale całkowicie wyklucza karty kredytowe. `Bezpieczna nadwyżka` wykorzystuje istniejącą prognozę okresową i najniższy przewidywany stan ponad ustawioną finansową podłogą, zaplanowanymi wydatkami oraz rezerwą `Budżet bieżący / dzień`. Rezerwa obejmuje wyłącznie pozostałe dni bieżącego okresu wypłaty i nie tworzy transakcji. Postęp celu może opcjonalnie korzystać z salda rzeczywistego powiązanego depozytu.

Przychody stałe są traktowane jako pewne. Jednorazowy planowany przychód może być pewny, oczekiwany albo potencjalny. Pewny wpływ zwiększa scenariusz konserwatywny, oczekiwany scenariusz oczekiwany, a potencjalny wyłącznie wariant rozszerzony. Raty zobowiązań wpływają na prognozę wyłącznie przez powiązane stałe wydatki i nie są liczone drugi raz z rekordu długu.

Powiązanie celu ze zwykłym depozytem nie wykonuje przelewów ani nie zmienia salda konta. Domyślnie postęp celu wynika z ręcznie wpisanej kwoty przypisanej. Po włączeniu opcji **Uwzględniaj saldo depozytu jako postęp celu** postęp jest wyliczany na bieżąco z całego salda rzeczywistego powiązanego depozytu; ręczna kwota pozostaje zapisana, ale nie jest wtedy używana w obliczeniach. Kalkulator nowych środków oraz rekomendacje są wyliczane chwilowo i nie są zapisywane.
