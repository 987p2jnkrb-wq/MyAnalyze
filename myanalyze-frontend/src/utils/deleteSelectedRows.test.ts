import { deleteSelectedRows } from "./deleteSelectedRows";

describe("deleteSelectedRows", () => {
  it("processes every selected row and refreshes once", async () => {
    const removed: number[] = [];
    const refresh = jest.fn(async () => undefined);

    await expect(deleteSelectedRows([1, 2, 3], async (id) => { removed.push(id); }, refresh)).resolves.toBe(3);

    expect(removed).toEqual([1, 2, 3]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reports a partial failure after processing the remaining rows", async () => {
    const removed: number[] = [];
    const refresh = jest.fn(async () => undefined);

    await expect(deleteSelectedRows([1, 2, 3], async (id) => {
      if (id === 2) throw new Error("blocked");
      removed.push(id);
    }, refresh)).rejects.toThrow("Usunięto 2 z 3 rekordów");

    expect(removed).toEqual([1, 3]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
