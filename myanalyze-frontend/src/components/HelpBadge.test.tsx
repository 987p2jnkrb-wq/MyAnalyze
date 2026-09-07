import { fireEvent, render, screen } from "@testing-library/react";
import HelpBadge from "./HelpBadge";
import { AppPresentationProvider } from "../i18n";
import { UI_LAYERS } from "./uiLayers";

describe("HelpBadge", () => {
  beforeEach(() => localStorage.clear());

  it("renders its translated tooltip in a portal above a modal", () => {
    localStorage.setItem("myanalyze.language", "en");
    render(<AppPresentationProvider><HelpBadge help="Udziały w konfiguratorze opisują całą pulę, która zostaje po uzupełnieniu finansowej podłogi i rezerwy na codzienne wydatki. Suma musi wynosić dokładnie 100%.">Gotowe</HelpBadge></AppPresentationProvider>);

    fireEvent.mouseEnter(screen.getByRole("button", { name: /Done/ }));
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("The shares in the configurator");
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip.style.zIndex).toBe(String(UI_LAYERS.tooltip));
  });
});
