import { render, screen } from "@testing-library/react";
import Button from "./Button";

describe("Button", () => {
  it("stosuje styl primary", () => {
    render(<Button tone="primary">Zapisz</Button>);
    const button = screen.getByRole("button", { name: "Zapisz" });
    expect(button.className).toContain("bg-blue-600");
    expect(button.className).toContain("hover:bg-blue-700");
  });

  it("stosuje styl secondary", () => {
    render(<Button tone="secondary">Etykiety</Button>);
    const button = screen.getByRole("button", { name: "Etykiety" });
    expect(button.className).toContain("bg-blue-50");
    expect(button.className).toContain("hover:bg-blue-100");
  });

  it("przekazuje disabled", () => {
    render(<Button disabled>Zapisz</Button>);
    expect((screen.getByRole("button", { name: "Zapisz" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
