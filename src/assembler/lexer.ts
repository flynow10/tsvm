export type Token = {
  type: TokenType;
  text: string;
};

export enum TokenType {
  ORIG,
  FILL,
  STRINGZ,
  BLKW,
  END,
  NEW_LINE,
  DECIMAL,
  HEX,
  BINARY,
  OPCODE,
  REGISTER,
  LABEL,
  STRING,
  EOF,
}

export class Lexer {
  private static readonly OPCODES = [
    "add",
    "and",
    "not",
    "ld",
    "ldr",
    "ldi",
    "st",
    "str",
    "sti",
    "lea",
    "trap",
    "halt",
    "getc",
    "out",
    "puts",
    "in",
    "putsp",
    "jmp",
    "ret",
    "rti",
    "jsr",
    "jsrr",
    "br",
    "brz",
    "brp",
    "brn",
    "brnz",
    "brnp",
    "brzp",
    "brnzp",
  ];

  private static readonly REGISTER_NAMES = [
    "r0",
    "r1",
    "r2",
    "r3",
    "r4",
    "r5",
    "r6",
    "r7",
  ];

  private static readonly TOKEN_MATCHERS: Array<{
    key: string;
    type: TokenType;
  }> = [
    {
      key: ".orig",
      type: TokenType.ORIG,
    },
    {
      key: ".fill",
      type: TokenType.FILL,
    },
    {
      key: ".stringz",
      type: TokenType.STRINGZ,
    },
    {
      key: ".blkw",
      type: TokenType.BLKW,
    },
    {
      key: ".end",
      type: TokenType.END,
    },
  ];

  private static readonly NUMBER_MATCHERS = [
    { type: TokenType.HEX, matcher: /^x-?[0-9a-fA-F]+$/ },
    { type: TokenType.BINARY, matcher: /^b-?(?:0|1)+$/ },
    { type: TokenType.DECIMAL, matcher: /^#-?[0-9]+$/ },
  ];

  private isTokenSeparator(char: string): boolean {
    if (
      char == " " ||
      char == "\t" ||
      char == "\n" ||
      char == "\r" ||
      char == undefined
    )
      return true;
    if (char == "," || char == ";") return true;
    return false;
  }

  public tokenize(input: string) {
    const out: Token[] = [];
    let currentPosition = 0;

    const lookaheadString = (str: string): boolean => {
      for (let i = 0; i < str.length; i++) {
        if (
          input[currentPosition + i] === undefined ||
          str[i] !== input[currentPosition + i].toLowerCase()
        ) {
          return false;
        }
      }
      return true;
    };

    while (currentPosition < input.length) {
      const currentToken = input[currentPosition];

      if (
        this.isTokenSeparator(currentToken) &&
        currentToken !== "\n" &&
        currentToken !== undefined &&
        currentToken !== ";"
      ) {
        currentPosition++;
        continue;
      }

      if (currentToken === "\n") {
        out.push({
          type: TokenType.NEW_LINE,
          text: "\n",
        });
        while (input[currentPosition] === "\n") {
          currentPosition++;
        }
        continue;
      }
      if (currentToken === ";") {
        while (
          input[currentPosition] !== "\n" &&
          input[currentPosition] !== undefined
        ) {
          currentPosition++;
        }
        continue;
      }
      let didMatch = false;
      for (const { key, type } of Lexer.TOKEN_MATCHERS) {
        if (!lookaheadString(key)) {
          continue;
        }

        out.push({
          type,
          text: key,
        });
        currentPosition += key.length;
        didMatch = true;
      }
      if (didMatch) {
        continue;
      }
      currentPosition++;
      if (currentToken === '"') {
        let stringLiteralChars = [];

        while (
          input[currentPosition] !== '"' &&
          input[currentPosition] !== undefined &&
          input[currentPosition] !== "\n"
        ) {
          const here = input[currentPosition];
          if (here === "\\") {
            const escapeSequence = input[++currentPosition];

            const escaped = {
              "0": "\0",
              n: "\n",
              r: "\r",
              '"': '"',
              "\\": "\\",
              e: String.fromCharCode(27),
            }[escapeSequence];

            if (escapeSequence === undefined) {
              throw new Error(`Unsupported escape character ${escapeSequence}`);
            }
            stringLiteralChars.push(escaped);
          } else {
            stringLiteralChars.push(input[currentPosition]);
          }
          currentPosition++;
        }
        currentPosition++;
        out.push({
          type: TokenType.STRING,
          text: stringLiteralChars.join(""),
        });
        continue;
      }

      let literal = currentToken;
      while (!this.isTokenSeparator(input[currentPosition])) {
        literal += input[currentPosition];
        currentPosition++;
      }
      const lowerCaseLiteral = literal.toLowerCase();
      if (Lexer.OPCODES.includes(lowerCaseLiteral)) {
        out.push({
          type: TokenType.OPCODE,
          text: lowerCaseLiteral,
        });
      } else if (Lexer.REGISTER_NAMES.includes(lowerCaseLiteral)) {
        out.push({
          type: TokenType.REGISTER,
          text: lowerCaseLiteral,
        });
      } else {
        for (const { type, matcher } of Lexer.NUMBER_MATCHERS) {
          if (lowerCaseLiteral.match(matcher)) {
            out.push({
              type: type,
              text: lowerCaseLiteral,
            });
            didMatch = true;
            break;
          }
        }
        if (didMatch) {
          continue;
        }

        out.push({
          type: TokenType.LABEL,
          text: literal,
        });
      }
    }
    out.push({
      type: TokenType.EOF,
      text: "",
    });

    return out;
  }
}
