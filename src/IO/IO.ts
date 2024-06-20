export interface IO {
  getChar(): number;
  putChar(char: number): void;
  print(string: string): void;
}
