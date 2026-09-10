# MyAnalyze — dokumentacja produktu

> **Język:** Polski · [English](../en/README.md)

MyAnalyze 1.5 jest lokalną aplikacją do zarządzania i analizowania budżetu: użytkownik ręcznie prowadzi depozyty, przychody, wydatki, wpisy stałe oraz zobowiązania, a aplikacja pomaga planować miesiąc i okres do kolejnej wypłaty. Aplikacja nie ma bezpośredniej integracji z bankiem; plik CSV lub tekstowy PDF można zaimportować wyłącznie po to, aby uzupełnić historię wykonanych operacji i porównać plan z rzeczywistymi wydatkami.

## Dokumenty

- [Cel i zakres](01-purpose-and-scope.md) — czym jest aplikacja, z jakich modułów się składa i czego świadomie nie robi.
- [Reguły biznesowe](02-business-rules.md) — salda, karty kredytowe, transakcje, wpisy stałe, zobowiązania, kredyty i podsumowania.
- [Import CSV i PDF](03-csv-and-pdf-import.md) — przebieg importu wyciągu, zabezpieczenia i celowe uproszczenia.
- [Model danych importu](08-import-data-model.md) — znormalizowane operacje, identyfikatory instrumentów i relacje `OWN_TRANSFER`.
- [Architektura i rozwój](04-architecture-and-development.md) — budowa techniczna, wspólne komponenty, testowanie i bezpieczny kierunek rozwoju.
- [Decyzje produktowe i QA](05-product-decisions-and-qa.md) — zachowania, których nie należy zgłaszać jako błędów bez ponownej decyzji produktowej.
- [Wydanie 1.1](06-release-1.1.md) — najważniejsze funkcje i zmiany stabilizujące poprzednie wydanie.
- [Wydanie 1.2](07-release-1.2.md) — konfiguracja aplikacji, ujednolicone tabele i końcowe poprawki UX.
- [Model DataGrid](datagrid-model.md) — odpowiedzialność wspólnego grida i granice jego rozbudowy.

Instrukcje uruchamiania, testowania i budowania instalatora znajdują się w [Instrukcja/KOMENDY-URUCHAMIANIE-I-BUILD.md](../../Instrukcja/KOMENDY-URUCHAMIANIE-I-BUILD.md).

## Najkrótszy opis działania

1. W zakładce **Depozyty** użytkownik wpisuje aktualne stany kont, gotówki, wirtualnych portfeli i kart kredytowych.
2. W **Przychodach** i **Wydatkach** planuje pojedyncze operacje, a następnie realizuje je z wybranego depozytu.
3. Podzakładki **Stałe** w Przychodach i Wydatkach opisują operacje cykliczne.
4. **Zobowiązania** są lekkim zestawieniem długów, rat i limitów, natomiast **Kredyty** przechowują szczegółowe dane produktu kredytowego.
5. Podzakładki **Ogólne**, **Okres** i **Miesiąc** w Podsumowaniu są tylko do odczytu i wyliczają plan, wykonanie oraz prognozę z tych samych danych.
6. **Cele** wykorzystują te same dane do obliczenia realnej płynności, bezpiecznej nadwyżki i ręcznie zarządzanych celów oraz potrafią przygotować anonimowy prompt do analizy w GPT.
7. Import CSV/PDF dopisuje wykonane operacje do historii, ale nie zastępuje ręcznej kontroli sald.
8. Przycisk **Pobierz CSV** na pasku Managera tworzy zbiorczy eksport kont, wpisów stałych, zaplanowanych transakcji i zobowiązań.
9. Interfejs działa po polsku i angielsku. Globalne ustawienie PLN/EUR/USD zmienia wyłącznie sposób prezentacji symbolu waluty i nie przelicza ani nie modyfikuje zapisanych kwot.
10. Podział nowych środków między cele może być ustawiony procentowo przez użytkownika; algorytm pozostaje rekomendacją, a nie automatycznym wykonawcą decyzji.
