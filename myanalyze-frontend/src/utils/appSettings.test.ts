import { loadAppSettings, saveAppSettings } from "./appSettings";

describe("appSettings", () => {
  beforeEach(() => localStorage.clear());

  it("uses the light theme by default and ignores a legacy dark value", () => {
    localStorage.setItem("myanalyze.theme", "dark");
    expect(loadAppSettings().theme).toBe("light");
  });

  it("remembers dark theme only after settings are explicitly saved", () => {
    saveAppSettings({ language: "pl", theme: "dark", currency: "PLN", username: "Mikołaj" });
    expect(loadAppSettings()).toEqual({ language: "pl", theme: "dark", currency: "PLN", username: "Mikołaj" });
  });
});
