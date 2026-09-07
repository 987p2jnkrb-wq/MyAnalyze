import { ALL_MODULES, mergeModuleConfiguration, normalizeModuleOrder } from "./modules";

describe("normalizeModuleOrder", () => {
  it("obsługuje kolejność zwróconą przez SQLite jako tekst", () => {
    expect(normalizeModuleOrder("12", 3)).toBe(12);
  });

  it("używa wartości domyślnej dla nieprawidłowej kolejności", () => {
    expect(normalizeModuleOrder("brak", 3)).toBe(3);
    expect(normalizeModuleOrder("", 3)).toBe(3);
  });

  it("nie udostępnia usuniętego modułu Inwestycje", () => {
    expect(ALL_MODULES.map((module) => module.key)).toEqual(["manager", "logi", "config"]);
  });

  it("wspólnie scala ustawienia dla strony startowej i konfiguracji", () => {
    const merged = mergeModuleConfiguration([{ key: "manager", name: "Domowe finanse", visible: "0", order_index: "5" as unknown as number }]);
    expect(merged.find((module) => module.key === "manager")).toEqual(expect.objectContaining({
      name: "Domowe finanse",
      visible: "0",
      order_index: 5,
      route: "/manager",
    }));
    expect(merged.find((module) => module.key === "config")?.visible).toBe("1");
  });
});
