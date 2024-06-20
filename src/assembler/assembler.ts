import { Lexer, Token, TokenType } from "./lexer";
import { inspect } from "util";

type SymbolTable = Record<string, number>;
export class Assembler {
  private static readonly NUMBER_TYPES = [
    TokenType.BINARY,
    TokenType.HEX,
    TokenType.DECIMAL,
  ];
  private readonly lexer = new Lexer();
  private program: string = "";
  private tokenList: Token[] = [];
  private symbolTable: SymbolTable = {};
  private tokenIndex = 0;
  private machineCode: number[] = [];

  public loadProgram(program: string) {
    this.program = program;
    this.tokenList = this.lexer.tokenize(program);
    // process.stdout.write(`[${this.tokenList.map((token) => token.text)}]`);
    this.symbolTable = this.passOne(this.tokenList);
    this.machineCode = this.passTwo(this.tokenList, this.symbolTable);
    return this;
  }

  public asArrayBuffer() {
    const buff = new ArrayBuffer(this.machineCode.length * 2);
    const view = new DataView(buff);
    let byteOffset = 0;
    for (const word of this.machineCode) {
      view.setUint16(byteOffset, word, false);
      byteOffset += 2;
    }
    return buff;
  }

  public asSymbolTable() {
    let st = "";
    for (const [symbol, location] of Object.entries(this.symbolTable)) {
      st += `// ${symbol}: ${location
        .toString(16)
        .padStart(4, "0")
        .toUpperCase()}\n`;
    }
    return st;
  }

  public numLitToInt(numStr: string): number {
    let num = NaN;
    if (numStr.startsWith("#")) num = parseInt(numStr.slice(1), 10);
    else if (numStr.startsWith("x")) num = parseInt(numStr.slice(1), 16);
    else if (numStr.startsWith("b")) num = parseInt(numStr.slice(1), 2);
    return num;
  }

  public numToBin(num: number, bits: number = 16): number {
    const mask = ~0 >>> (32 - bits);
    if (num >= 0) return num & mask;
    else return (num >>> 0) & mask;
  }

  private expectToken(
    tokenTypes: TokenType[] | TokenType,
    constraints: { bits?: number; unsigned?: boolean } = {}
  ) {
    this.tokenIndex++;
    if (!Array.isArray(tokenTypes)) {
      tokenTypes = [tokenTypes];
    }
    const subToken = this.tokenList[this.tokenIndex];
    if (!tokenTypes.includes(subToken.type)) {
      throw new Error(
        "Unexpected token: " +
          subToken.text +
          " Expected: [" +
          tokenTypes.join(", ") +
          "]"
      );
    }
    if (Assembler.NUMBER_TYPES.includes(subToken.type)) {
      const num = this.numLitToInt(subToken.text);
      if (constraints.bits !== undefined) {
        if (
          num < -(2 ** (constraints.bits - 1)) ||
          num >= 2 ** constraints.bits
        ) {
          throw new Error("Number out of range: " + num);
        }
      }
      if (constraints.unsigned) {
        if (num < 0) {
          throw new Error("Unsigned number expected, received: " + num);
        }
      }
    }
    return subToken;
  }

  private passOne(tokenList: Token[]) {
    this.tokenIndex = 0;
    this.tokenList = tokenList;
    let token = this.tokenList[this.tokenIndex];
    const symbolTable: Record<string, number> = {};

    let locationCounter = NaN;
    while (token.type !== TokenType.EOF) {
      switch (token.type) {
        case TokenType.BLKW: {
          const subToken = this.expectToken(Assembler.NUMBER_TYPES);
          locationCounter += this.numLitToInt(subToken.text);
          break;
        }
        case TokenType.STRINGZ: {
          const subToken = this.expectToken(TokenType.STRING);
          locationCounter += subToken.text.length + 1; // allocate for "\0"
          break;
        }
        case TokenType.ORIG: {
          const subToken = this.expectToken(Assembler.NUMBER_TYPES);
          const num = this.numLitToInt(subToken.text);
          locationCounter = num;
          break;
        }
        case TokenType.END: {
          locationCounter = NaN;
          break;
        }
        case TokenType.FILL: {
          this.expectToken([TokenType.LABEL, ...Assembler.NUMBER_TYPES]);
          locationCounter++;
          break;
        }
        case TokenType.OPCODE: {
          locationCounter++;
          switch (token.text) {
            case "add":
            case "and": {
              this.expectToken(TokenType.REGISTER);
              this.expectToken(TokenType.REGISTER);
              this.expectToken(
                [TokenType.REGISTER, ...Assembler.NUMBER_TYPES],
                {
                  bits: 5,
                }
              );
              break;
            }
            case "not": {
              this.expectToken(TokenType.REGISTER);
              this.expectToken(TokenType.REGISTER);
              break;
            }
            case "ld":
            case "ldi":
            case "st":
            case "sti":
            case "lea": {
              this.expectToken(TokenType.REGISTER);
              this.expectToken([TokenType.LABEL, ...Assembler.NUMBER_TYPES], {
                bits: 9,
              });
              break;
            }
            case "str":
            case "ldr": {
              this.expectToken(TokenType.REGISTER);
              this.expectToken(TokenType.REGISTER);
              this.expectToken([TokenType.LABEL, ...Assembler.NUMBER_TYPES], {
                bits: 6,
              });
              break;
            }
            case "trap": {
              this.expectToken(Assembler.NUMBER_TYPES, { bits: 12 });
              break;
            }
            case "jmp": {
              this.expectToken(TokenType.REGISTER);
              break;
            }
            case "jsr": {
              this.expectToken([TokenType.LABEL, ...Assembler.NUMBER_TYPES], {
                bits: 11,
              });
              break;
            }
            case "jsrr": {
              this.expectToken(TokenType.REGISTER);
              break;
            }
            case "br":
            case "brnzp":
            case "brn":
            case "brz":
            case "brp":
            case "brnz":
            case "brnp":
            case "brzp": {
              this.expectToken([TokenType.LABEL, ...Assembler.NUMBER_TYPES], {
                bits: 9,
              });
              break;
            }
          }
          break;
        }
        case TokenType.LABEL: {
          symbolTable[token.text] = locationCounter;
          break;
        }
        case TokenType.NEW_LINE: {
          break;
        }
        default: {
          throw new Error(
            "Unexpected token: " + JSON.stringify(token) + " on new line!"
          );
        }
      }
      this.tokenIndex++;
      token = this.tokenList[this.tokenIndex];
    }

    return symbolTable;
  }

  private labelOrNumToBin(
    token: Token,
    lc: number,
    bits: number,
    absAddr = false
  ) {
    let num;
    if (Assembler.NUMBER_TYPES.includes(token.type)) {
      num = this.numLitToInt(token.text);
    } else {
      num = absAddr
        ? this.symbolTable[token.text]
        : this.symbolTable[token.text] - lc;
    }
    return this.numToBin(num, bits);
  }

  private registerToBin(token: Token) {
    const num = parseInt(token.text.slice(1));
    return this.numToBin(num);
  }

  private passTwo(tokenList: Token[], symbolTable: SymbolTable) {
    this.tokenIndex = 0;
    this.tokenList = tokenList;
    this.symbolTable = symbolTable;
    let token = this.tokenList[this.tokenIndex];
    const machineCode = [];

    let locationCounter = NaN;
    while (token.type !== TokenType.EOF) {
      switch (token.type) {
        case TokenType.BLKW: {
          const subToken = this.expectToken(Assembler.NUMBER_TYPES);
          const num = this.numLitToInt(subToken.text);
          for (let _ = 0; _ < num; _++) {
            machineCode.push(0);
          }
          locationCounter += num;
          break;
        }
        case TokenType.STRINGZ: {
          const subToken = this.expectToken(TokenType.STRING);
          for (let i = 0; i < subToken.text.length; i++) {
            machineCode.push(this.numToBin(subToken.text.charCodeAt(i), 16));
          }
          machineCode.push(0);
          locationCounter += subToken.text.length + 1; // allocate for "\0"
          break;
        }
        case TokenType.ORIG: {
          const subToken = this.expectToken(Assembler.NUMBER_TYPES);
          const num = this.numLitToInt(subToken.text);
          if (isNaN(locationCounter)) {
            machineCode.push(this.numToBin(num, 16));
          }
          locationCounter = num;
          break;
        }
        case TokenType.END: {
          locationCounter = NaN;
          break;
        }
        case TokenType.FILL: {
          const subToken = this.expectToken([
            TokenType.LABEL,
            ...Assembler.NUMBER_TYPES,
          ]);
          machineCode.push(this.labelOrNumToBin(subToken, locationCounter, 16));
          locationCounter++;
          break;
        }
        case TokenType.OPCODE: {
          locationCounter++;
          let argToken1: Token;
          let argToken2: Token;
          let argToken3: Token;
          switch (token.text) {
            case "add":
            case "and": {
              argToken1 = this.expectToken(TokenType.REGISTER);
              argToken2 = this.expectToken(TokenType.REGISTER);
              argToken3 = this.expectToken(
                [TokenType.REGISTER, ...Assembler.NUMBER_TYPES],
                {
                  bits: 5,
                }
              );
              let instruction = 0;
              if (token.text === "add") {
                instruction = 0b0001 << 12;
              } else {
                instruction = 0b0101 << 12;
              }
              instruction |= this.registerToBin(argToken1) << 9;
              instruction |= this.registerToBin(argToken2) << 6;
              if (argToken3.type === TokenType.REGISTER) {
                instruction |= this.registerToBin(argToken3);
              } else {
                instruction |= 1 << 5;
                instruction |= this.numToBin(
                  this.numLitToInt(argToken3.text),
                  5
                );
              }
              machineCode.push(instruction);
              break;
            }
            case "not": {
              argToken1 = this.expectToken(TokenType.REGISTER);
              argToken2 = this.expectToken(TokenType.REGISTER);
              let instruction = 0b1001 << 12;
              instruction |= this.registerToBin(argToken1) << 9;
              instruction |= this.registerToBin(argToken2) << 6;
              machineCode.push(instruction);
              break;
            }
            case "ld":
            case "ldi":
            case "st":
            case "sti":
            case "lea": {
              argToken1 = this.expectToken(TokenType.REGISTER);
              argToken2 = this.expectToken(
                [TokenType.LABEL, ...Assembler.NUMBER_TYPES],
                {
                  bits: 9,
                }
              );
              let instruction = 0;
              switch (token.text) {
                case "ld":
                  instruction = 0b0010 << 12;
                  break;
                case "ldi":
                  instruction = 0b1010 << 12;
                  break;
                case "lea":
                  instruction = 0b1110 << 12;
                  break;
                case "st":
                  instruction = 0b0011 << 12;
                  break;
                case "sti":
                  instruction = 0b1011 << 12;
                  break;
              }
              instruction |= this.registerToBin(argToken1) << 9;
              instruction |= this.labelOrNumToBin(
                argToken2,
                locationCounter,
                9
              );
              machineCode.push(instruction);
              break;
            }
            case "str":
            case "ldr": {
              argToken1 = this.expectToken(TokenType.REGISTER);
              argToken2 = this.expectToken(TokenType.REGISTER);
              argToken3 = this.expectToken(
                [TokenType.LABEL, ...Assembler.NUMBER_TYPES],
                {
                  bits: 6,
                }
              );
              let instruction = 0;
              if (token.text === "ldr") {
                instruction = 0b0110 << 12;
              } else {
                instruction = 0b0111 << 12;
              }
              instruction |= this.registerToBin(argToken1) << 9;
              instruction |= this.registerToBin(argToken2) << 6;
              instruction |= this.labelOrNumToBin(
                argToken3,
                locationCounter,
                6
              );
              machineCode.push(instruction);
              break;
            }
            case "trap": {
              argToken1 = this.expectToken(Assembler.NUMBER_TYPES, {
                bits: 12,
              });
              let instruction = 0b1111 << 12;
              instruction |= this.numToBin(
                this.numLitToInt(argToken1.text),
                12
              );
              machineCode.push(instruction);
              break;
            }
            case "getc": {
              machineCode.push(0b1111_0000_0010_0000);
              break;
            }
            case "out": {
              machineCode.push(0b1111_0000_0010_0001);
              break;
            }
            case "puts": {
              machineCode.push(0b1111_0000_0010_0010);
              break;
            }
            case "in": {
              machineCode.push(0b1111_0000_0010_0011);
              break;
            }
            case "putsp": {
              machineCode.push(0b1111_0000_0010_0100);
              break;
            }
            case "halt": {
              machineCode.push(0b1111_0000_0010_0101);
              break;
            }
            case "jmp": {
              argToken1 = this.expectToken(TokenType.REGISTER);
              let instruction = 0b1100 << 12;
              instruction |= this.registerToBin(argToken1) << 6;
              break;
            }
            case "ret": {
              machineCode.push(0b1100_0001_1100_0000);
              break;
            }
            case "rti": {
              machineCode.push(0b1000_0000_0000_0000);
              break;
            }
            case "jsr": {
              argToken1 = this.expectToken(
                [TokenType.LABEL, ...Assembler.NUMBER_TYPES],
                {
                  bits: 11,
                }
              );
              let instruction = 0b0100 << 12;
              instruction |= 1 << 11;
              instruction |= this.labelOrNumToBin(
                argToken1,
                locationCounter,
                11
              );
              machineCode.push(instruction);
              break;
            }
            case "jsrr": {
              argToken1 = this.expectToken(TokenType.REGISTER);
              let instruction = 0b0100 << 12;
              instruction |= this.registerToBin(argToken1) << 6;
              machineCode.push(instruction);
              break;
            }
            case "br":
            case "brnzp":
            case "brn":
            case "brz":
            case "brp":
            case "brnz":
            case "brnp":
            case "brzp": {
              let n = token.text.indexOf("n") !== -1 ? 0b100 : 0;
              let z = token.text.indexOf("z") !== -1 ? 0b010 : 0;
              let p = token.text.indexOf("p") !== -1 ? 0b001 : 0;
              let mask = n | z | p;
              if (mask === 0) {
                mask = 0x7;
              }
              argToken1 = this.expectToken(
                [TokenType.LABEL, ...Assembler.NUMBER_TYPES],
                {
                  bits: 9,
                }
              );
              let instruction = 0b0000 << 12;
              instruction |= mask << 9;
              instruction |= this.labelOrNumToBin(
                argToken1,
                locationCounter,
                9
              );
              machineCode.push(instruction);
              break;
            }
          }
          break;
        }
        case TokenType.LABEL:
        case TokenType.NEW_LINE: {
          break;
        }
        default: {
          throw new Error(
            "Unexpected token: " + JSON.stringify(token) + " on new line!"
          );
        }
      }
      this.tokenIndex++;
      token = this.tokenList[this.tokenIndex];
    }
    return machineCode;
  }
}
