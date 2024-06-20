import { CPU } from "./cpu";
import { readFileSync } from "fs";
import path from "path";
import { Terminal } from "./IO/terminal";

const args = process.argv.slice(2);

const vm = new CPU(new Terminal());

const bootPath = path.resolve(process.cwd(), args[0] ?? "./bin/out.obj");
const bootImage = readFileSync(bootPath);

vm.loadImage(bootImage);
vm.run();

function indexBy<T extends Record<string, any>>(array: T[], prop: keyof T) {
  return array.reduce<Record<string, T>>((output, item) => {
    output[item[prop]] = item;
    return output;
  }, {});
}
