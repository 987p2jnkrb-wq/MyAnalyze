import { fireEvent, render, screen } from "@testing-library/react";
import Modal from "./Modal";
import Toast from "./Toast";
import { UI_LAYERS } from "./uiLayers";

describe("overlay layers", () => {
  it("renders an error toast above an open modal", () => {
    render(
      <>
        <Modal open onClose={jest.fn()} title="Formularz">
          <p>Treść formularza</p>
        </Modal>
        <Toast message="Nie udało się zapisać." type="error" duration={60_000} />
      </>,
    );

    const dialog = screen.getByRole("dialog", { name: "Formularz" });
    const alert = screen.getByRole("alert");
    const modalLayer = dialog.parentElement as HTMLElement;

    expect(Number(alert.style.zIndex)).toBeGreaterThan(Number(modalLayer.style.zIndex));
    expect(modalLayer.style.zIndex).toBe(String(UI_LAYERS.modal));
    expect(alert.style.zIndex).toBe(String(UI_LAYERS.toast));
  });

  it("gives simultaneous modals unique accessible title identifiers", () => {
    render(
      <>
        <Modal open onClose={jest.fn()} title="Pierwszy"><span>Pierwszy formularz</span></Modal>
        <Modal open onClose={jest.fn()} title="Drugi"><span>Drugi formularz</span></Modal>
      </>,
    );

    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs[0].getAttribute("aria-labelledby")).not.toBe(dialogs[1].getAttribute("aria-labelledby"));
  });

  it("does not close a form after an accidental backdrop click", () => {
    const onClose = jest.fn();
    render(<Modal open onClose={onClose} title="Formularz"><input aria-label="Nazwa" defaultValue="Wpisane dane" /></Modal>);

    fireEvent.mouseDown(screen.getByRole("dialog").parentElement as HTMLElement);

    expect(onClose).not.toHaveBeenCalled();
  });
});
