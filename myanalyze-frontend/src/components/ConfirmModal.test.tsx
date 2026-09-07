import { fireEvent, render, screen } from "@testing-library/react";
import ConfirmModal from "./ConfirmModal";

describe("ConfirmModal", () => {
  it("uses an accessible modal and invokes the selected action", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<ConfirmModal open title="Potwierdź usunięcie" message="Czy na pewno usunąć konto?" onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByRole("dialog", { name: "Potwierdź usunięcie" })).not.toBeNull();
    expect(screen.getByText("Czy na pewno usunąć konto?")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tak" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("does not render when closed", () => {
    render(<ConfirmModal open={false} message="Usunąć?" onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
