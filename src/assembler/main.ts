import { readFileSync, writeFileSync } from "fs";
import { Assembler } from "./assembler";
import path from "path";

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.warn("Usage: yarn run assemble [INPUT_PATH] [OUTPUT_PATH]");
  process.exit();
}
const getPath = (relative: string) => path.resolve(process.cwd(), relative);

const assembler = new Assembler();

const inputFile = readFileSync(getPath(args[0]), "utf-8");

const machineCode = assembler.loadProgram(inputFile).asArrayBuffer();

writeFileSync(getPath(args[1]), new DataView(machineCode));

// const symbolTable = assembler.loadProgram(inputFile).asSymbolTable();

// writeFileSync(getPath(args[1]), symbolTable);
