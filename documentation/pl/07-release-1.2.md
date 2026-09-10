# MyAnalyze 1.2

Wydanie 1.2 rozwija stabilną wersję 1.1 bez przebudowy podstawowej logiki produktu. Numer techniczny paczki i instalatora to `1.2.0`.

Najważniejsze zmiany:

- pełny ekran konfiguracji oparty na wspólnym `DataGrid`, z motywem jasnym i ciemnym, aliasem oraz konfiguracją modułów w popupie;
- jasny motyw jako ustawienie domyślne i wspólne komunikaty toast;
- wszystkie główne moduły tabelaryczne korzystają ze wspólnego `DataGrid`;
- bezpieczne usuwanie pojedynczych i zaznaczonych logów aktywności z potwierdzeniem;
- czytelne, rozróżnialne kolory typów produktów finansowych;
- wspólne oznaczenia jednostek: waluta z Konfiguracji dla kwot oraz `%` wyłącznie dla RRSO i oprocentowania;
- nawigacja poprzedni/następny dzień przy dacie prognozy w Podsumowaniu okresu;
- dalsze ujednolicenie walidacji, formularzy kredytowych, zobowiązań i harmonogramów rat.

Paczka źródłowa występuje w dwóch wariantach: kopia z aktualnymi danymi właściciela oraz wariant z czystą bazą startową dla nowego użytkownika. Instalator Electron zawsze korzysta z czystego szablonu bazy i nie zawiera prywatnych danych.
