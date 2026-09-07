import { parseRequiredNumber } from "./numbers";

describe("parseRequiredNumber", () => {
  it("nie zamienia pustego pola wymaganego na zero", () => {
    expect(parseRequiredNumber("")).toBeNaN();
    expect(parseRequiredNumber("   ")).toBeNaN();
  });

  it("konwertuje wpisaną liczbę dopiero podczas zapisu", () => {
    expect(parseRequiredNumber("123.45")).toBe(123.45);
    expect(parseRequiredNumber("123,45")).toBe(123.45);
    expect(parseRequiredNumber("0")).toBe(0);
  });
});
