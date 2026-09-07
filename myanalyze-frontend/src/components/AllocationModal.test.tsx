import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AllocationModal from "./AllocationModal";

describe("AllocationModal", () => {
  test("akceptuje przecinek dziesiętny i przekazuje wybrane źródło", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<AllocationModal open title="Realizacja częściowa" sourceLabel="Konto" sourcePlaceholder="Wybierz konto" options={[{ id: 7, label: "Portfel", availableAmount: 500 }]} maximumAmount={1800} submitLabel="Zrealizuj" onClose={() => undefined} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "7" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "200,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Zrealizuj" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(7, 200.5));
  });

  test("nie pozwala przekroczyć mniejszej z dostępnych kwot", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<AllocationModal open title="Rozliczenie" sourceLabel="Przychód" sourcePlaceholder="Wybierz przychód" options={[{ id: 9, label: "Vinted", availableAmount: 100 }]} maximumAmount={300} submitLabel="Rozlicz" onClose={() => undefined} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "9" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "100,01" } });
    fireEvent.click(screen.getByRole("button", { name: "Rozlicz" }));

    expect(await screen.findByText(/Maksymalna kwota to/)).not.toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("pokazuje saldo informacyjnie bez ograniczania kwoty przychodu", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<AllocationModal open title="Wpłata częściowa" sourceLabel="Konto" sourcePlaceholder="Wybierz konto" availabilityLabel="saldo" options={[{ id: 3, label: "PKO BP", displayAmount: 100 }]} maximumAmount={1800} submitLabel="Zrealizuj" onClose={() => undefined} onSubmit={onSubmit} />);

    expect(screen.getByRole("option", { name: /PKO BP.*saldo.*100/ })).not.toBeNull();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "3" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: "Zrealizuj" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(3, 1200));
  });

  test("podpowiada dzisiejszą datę częściowej realizacji i przekazuje ją przy zapisie", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { container } = render(<AllocationModal open title="Wpłata częściowa" sourceLabel="Konto" sourcePlaceholder="Wybierz konto" options={[{ id: 3, label: "PKO BP", displayAmount: 100 }]} maximumAmount={1800} submitLabel="Zrealizuj" dateLabel="Data realizacji" defaultDate="2026-09-01" onClose={() => undefined} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "3" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "200" } });
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe("2026-09-01");
    fireEvent.click(screen.getByRole("button", { name: "Zrealizuj" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(3, 200, "2026-09-01"));
  });
});
