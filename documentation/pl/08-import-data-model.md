# Model danych importu i cross-transakcji

Dokument opisuje prosty model używany przez import CSV. Nie jest to model bankowy ani księgowy.

## Znormalizowana operacja

Adapter pliku zwraca wspólną operację zawierającą co najmniej:

- `sourceInstrument` — bank/provider, identyfikator z pliku i typ instrumentu (`account`, `debit_card`, `credit_card`);
- datę operacji i opcjonalnie datę rozliczenia;
- podpisaną kwotę, walutę, status i `rawType`;
- opis, kontrahenta i surowe dane pomocnicze;
- wspólną klasyfikację aplikacji, np. `normal_transaction`, `transfer_candidate`, `card_payment`, `card_repayment`, `refund` albo `unknown`.

Opis, kontrahent i rozpoznanie typu nie są wymagane do importu. Nazwa używa fallbacku: opis → odbiorca/zleceniodawca → rodzaj operacji → „Operacja bankowa”.

## Kontrakt CSV dla narzędzi zewnętrznych

Wytyczne generowane w oknie importu opisują prosty, wspólny format rozdzielany średnikami:

```text
Date;Amount;Currency;Description;Counterparty;Type;Status;Transaction ID;Account
```

Każdy wiersz musi mieć wszystkie dziewięć pól, nawet jeśli część wartości jest pusta. `Account` jest identyfikatorem rachunku, karty lub portfela, z którego pochodzi operacja. `Transaction ID` może pozostać pusty tylko wtedy, gdy źródło go nie udostępnia. Nie wolno tworzyć danych, których nie ma w źródłowym wyciągu, ani usuwać powtarzających się operacji. Parser dopuszcza także polskie aliasy nagłówków, w tym `Data` i `Instrument`; format ogólny nie jest rozpoznawany jako konkretny bank wyłącznie na podstawie nazwy kolumny typu transakcji.

## Identyfikator instrumentu

Konto w aplikacji jest obiektem finansowym użytkownika. Identyfikator rachunku, karty lub portfela znaleziony w CSV jest informacją techniczną o źródle.

Planowane, opcjonalne mapowanie może mieć postać:

```text
account_import_identifiers
id
account_id
provider
external_identifier
instrument_type
label NULL
created_at
```

Mapowanie nie klasyfikuje operacji i nie wyłącza jej z budżetu. Przy jednym dopasowaniu konto można wybrać automatycznie; przy braku albo kolizji użytkownik wybiera ręcznie. Zamaskowane identyfikatory nie powinny być globalnie unikalne — bezpieczniejsza jest unikalność w obrębie konta, providera, identyfikatora i typu instrumentu oraz obsługa niejednoznaczności w interfejsie.

`provider` jest stabilnym kodem technicznym adaptera, np. `millennium`, `revolut` lub `vinted`. Opcjonalne `konta.institution_name` jest wyłącznie nazwą wyświetlaną w UI i nie uczestniczy w identyfikacji ani klasyfikacji transakcji.

## Etykiety i fallback importu

`custom_transaction_types` przechowuje wspólne etykiety użytkownika. Jedno `custom_type_id`, np. `Vinted`, może oznaczać zarówno przychód, jak i wydatek; kierunek nadal wynika z transakcji. Etykieta nie wpływa na logikę finansową ani wyłączenie z analiz.

`statement_import_classification` mapuje `provider + raw_type + kind` na etykietę i kategorię. `kind` pozostaje częścią mappingu, dzięki czemu przychód i wydatek mogą mieć inne kategorie, wskazując tę samą etykietę. Pusty `raw_type` jest fallbackiem providera. Dokładne mapowanie ma pierwszeństwo, a brak mapowania nie blokuje importu.

## Cross-transakcja

Cross-transakcja jest opcjonalną relacją:

```text
transaction A ↔ transaction B
link_type = OWN_TRANSFER
```

Obie operacje pozostają w swoich tabelach i historii. Dopiero potwierdzony link ustawia je poza analizą. Brak kandydata lub odrzucenie sugestii pozostawia operację zwykłym przychodem albo wydatkiem.

W obecnym prostym modelu relacja przechowuje typ i identyfikator obu stron, dzięki czemu obsługuje konto ↔ konto, konto ↔ portfel oraz konto ↔ karta kredytowa. Dla zwykłych kont preferowany jest przeciwny kierunek; dla spłaty karty kredytowej możliwy jest także ten sam kierunek, ale tylko gdy klasyfikacja wskazuje `card_repayment`.

## Granice

Adaptery mogą znać format konkretnego banku. Po normalizacji dopasowanie, budżet i analiza korzystają wyłącznie ze wspólnych pól. Nie projektujemy obecnie relacji wielu kart do jednego produktu ani rozbudowanego silnika reguł.
