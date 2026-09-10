# MyAnalyze 1.1

Wydanie 1.1 domyka aplikację jako prosty, lokalny manager finansów osobistych. Numer techniczny paczki i instalatora to `1.1.0`.

## Najważniejsze zmiany

- jeden Manager Finansów z zakładkami Depozyty, Przychody, Wydatki, Zobowiązania, Kredyty i Podsumowanie;
- wspólny DataGrid z wyszukiwaniem, filtrami wielokrotnego wyboru, profilami, zaznaczaniem zakresu, edycją inline i eksportem;
- jeden zbiorczy eksport CSV kont, wpisów stałych, planowanych transakcji i zobowiązań;
- szybka akcja `+/−` depozytu z wyborem zasilenia albo obciążenia;
- nowy typ depozytu **Wirtualny portfel**, bez możliwości powiązania z produktem kredytowym;
- automatyczna podpowiedź zadłużenia kredytu i planu ratalnego z możliwością ręcznej korekty;
- wyliczanie historycznie pozostałych rat, najbliższej raty i daty zakończenia;
- harmonogramy rat dostępne dla kredytów, z zachowaniem uproszczonego ręcznego oznaczania płatności;
- rozdzielenie rzeczywistych i dostępnych środków w podsumowaniu okresowym;
- atomowa, odporna na powtórzenie realizacja wpisów stałych;
- czytelniejszy log aktywności i historia depozytu, w tym polskie nazwy typów kont oraz powiązań produktów;
- pola kwotowe obsługujące przecinek i kropkę dziesiętną;
- ochrona formularzy przed przypadkowym zamknięciem kliknięciem tła.

## Stabilizacja

- frontend i backend współdzielą te same znaczenia typów produktów oraz reguły walidacji;
- powiązane operacje na saldach, ratach i logach korzystają z transakcji SQLite;
- karta kredytowa, plan ratalny, kredyt, stały wydatek i depozyt pozostają synchronizowane bez podwójnego liczenia zadłużenia;
- instalator zawiera czysty szablon bazy i nie nadpisuje istniejących danych użytkownika.

Szczegółowe reguły zachowania opisują [Reguły biznesowe](02-business-rules.md), a kryteria wydania [Decyzje produktowe i QA](05-product-decisions-and-qa.md).
