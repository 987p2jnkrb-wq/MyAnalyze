# MyAnalyze — zasady pracy

## Produkt

- MyAnalyze ma pozostać prostą aplikacją do zarządzania domowymi finansami, nie systemem księgowym.
- Nie próbuj budować produktu bankowego ani przewidywać wszystkich możliwych walidacji. Ważniejsza jest prosta, zrozumiała logika, którą można później łatwo wyprostować lub rozszerzyć, niż przedwczesne komplikowanie rozwiązania.
- Preferuj najmniejszą zmianę pasującą do obecnej architektury. Nie projektuj pod hipotetyczne edge case’y ani nie twórz rozbudowanych silników reguł bez wyraźnej potrzeby.
- Aplikacja produkcyjna startuje z aktualnego, pustego szablonu bazy. Nie dodawaj migracji starszych baz, jeśli użytkownik wyraźnie o nie nie poprosi.

## Model finansowy

- Plan i wykonanie to różne pojęcia. Import CSV jest źródłem wykonanych operacji i nie zmienia salda depozytu.
- Zaimportowana operacja domyślnie liczy się w budżecie. Brak dopasowania, nierozpoznany typ lub samo podobieństwo nie mogą jej automatycznie wyłączać.
- Wyłączenie z analiz wymaga konkretnej przyczyny: twardego duplikatu, potwierdzonego transferu własnego/spłaty własnej karty albo świadomego pominięcia.
- Transfer własny jest relacją dwóch zachowanych operacji i wymaga potwierdzenia lub jawnego powiązania.
- Cross-link transferu może łączyć operacje z różnych własnych kont; dla zwykłych kont preferowany jest układ wydatek ↔ przychód, a dla karty kredytowej także wydatek ↔ wydatek, jeśli klasyfikacja wskazuje spłatę karty.
- Zakup kartą kredytową jest wydatkiem; spłata karty jest transferem własnym dopiero po potwierdzeniu drugiej strony.

## Import bankowy

- Adapter może być bank-specific, ale po normalizacji logika finansowa musi być wspólna dla wszystkich banków.
- Pipeline: CSV → adapter → normalized transaction/instrument → klasyfikacja ogólna → duplikaty → transfer/card-payment matching → dopasowanie planu → preview → import.
- Opis i kontrahent są opcjonalnymi metadanymi. Fallback nazwy: Opis → Odbiorca/Zleceniodawca → Rodzaj transakcji → „Operacja bankowa”.
- Identyczne rekordy bez unikalnego ID w jednym pliku pozostają zaznaczone; fingerprint wykorzystuje liczność wystąpień. Powtórzony unikalny identyfikator bankowy jest twardym duplikatem.
- Nie umieszczaj konkretnych tekstów bankowych w logice Podsumowania, Celów ani budżetu. Mapowanie `rawType` należy do warstwy adaptera/klasyfikacji.
- Identyfikator instrumentu z CSV jest metadaną źródłową. Docelowe mapowanie `provider + external_identifier + instrument_type` do konta ma być opcjonalne i nie może samo wyłączać operacji z budżetu.
- `provider` jest stałym technicznym kodem adaptera (np. `millennium`), a nazwa instytucji jest opcjonalną etykietą konta w UI.
- Etykieta transakcji jest wspólna dla przychodów i wydatków oraz służy wyłącznie importowi, filtrom i raportom. Nie może zmieniać kierunku finansowego, cross-linku ani wyłączenia z analiz.

## Sposób pracy

- Analizuj tylko pliki bezpośrednio związane z zadaniem. Nie skanuj całego repozytorium ani dokumentacji bez konkretnej potrzeby; rozszerzaj zakres dopiero po znalezieniu rzeczywistej zależności.
- Preferuj istniejące modele, helpery i wzorce. Nie twórz nowych warstw ani abstrakcji, jeśli obecna struktura wystarcza.
- Nie wykonuj ponownie szerokiej analizy architektury, jeśli wymagane założenia są już określone w `AGENTS.md` lub dokumentacji projektu.
- Nie rozszerzaj zadania o poboczne refaktory i znalezione problemy. Wskaż je jako ryzyko, ale nie naprawiaj bez potrzeby.
- Zachowuj istniejące dane i niezwiązane zmiany użytkownika. Testy API uruchamiaj wyłącznie na tymczasowej kopii pustego szablonu.
- Uruchamiaj buildów ani testów, jeśli jest ryzyko regresji
- Po zmianach raportuj tylko: zmienione pliki, najważniejsze decyzje i ryzyka. Nie przepisuj kodu ani całych diffów.
