import { keyIn, keyInYN } from "readline-sync";
import { IO } from "./IO";

export class Terminal implements IO {
  print(string: string): void {
    process.stdout.write(string);
  }
  getChar(): number {
    const key = keyIn("").trim();
    if (key.toLowerCase() === "q") {
      if (keyInYN("Would you like to quit?")) {
        process.exit(0);
      }
    }
    return key.charCodeAt(0);
  }
  putChar(char: number): void {
    process.stdout.write(String.fromCharCode(char));
  }
}
