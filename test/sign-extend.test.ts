import { Terminal } from "../src/IO/terminal";
import { CPU } from "../src/cpu";

it("correctly extends sign values", () => {
  const cpu = new CPU(new Terminal());

  expect(cpu.signExtend(0b1_1111, 5)).toBe(0xffff);
  expect(cpu.signExtend(0b0_1111, 5)).toBe(0b1111);
  expect(cpu.signExtend(0b1_1111, 6)).toBe(0b1_1111);
});
