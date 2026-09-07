import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RealizeModal from "./RealizeModal";

describe("RealizeModal", () => {
  test("używa wspólnego opisu konta z saldem i czeka na realizację", async () => {
    const onSelect = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    render(<RealizeModal open title="Realizacja" accounts={[{ id: 4, nazwa: "PKO BP", saldo_dostepne: 250, saldo_wlasciwe: 250, typ_depozytu: "konto" }]} onSelect={onSelect} onClose={onClose} />);

    expect(screen.getByRole("option", { name: /PKO BP.*saldo.*250/ })).not.toBeNull();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Zrealizuj" }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(4));
    expect(onClose).toHaveBeenCalled();
  });
});
