import { IO } from "./IO/IO";
import { Flag } from "./enums/flags";
import { OPCode } from "./enums/op-codes";
import { MMRegister, Register } from "./enums/registers";
import { TRAPCode } from "./enums/trap-codes";
import { createMemory } from "./memory";

export class CPU {
  private static readonly MEM_SIZE = 1 << 16; // 2^16 (65536)
  private static readonly PC_START = 0x3000; // 0011 0000 0000 0000
  private readonly memory = createMemory(CPU.MEM_SIZE);
  private readonly registers = createMemory(Register.RCOUNT);

  constructor(private readonly io: IO) {}

  public loadImage(image: Buffer) {
    const origin = image.readUint16BE(0);
    let pos = 0;
    while ((pos + 1) * 2 < image.length) {
      this.memory[origin + pos] = image.readUint16BE((pos + 1) * 2);
      pos++;
    }
  }
  public loadArray(array: number[]) {
    const origin = array[0];
    let pos = 0;
    while (pos < array.length) {
      this.memory[origin + pos] = array[pos];
      pos++;
    }
  }

  private init() {
    this.registers[Register.RCOND] = Flag.ZRO;
    this.registers[Register.RPC] = CPU.PC_START;
  }

  private fetch() {
    return this.memRead(this.registers[Register.RPC]++);
  }

  public run() {
    this.init();

    let running = true;

    while (running) {
      const instruction = this.fetch();
      const op = instruction >> 12;

      switch (op) {
        case OPCode.ADD: {
          // Instruction Encoding
          // 15 14 13 12 11 10 09 08 07 06 05 04 03 02 01 00
          // [ op code ] [  DR  ] [ SR1  ] 0  0  0  [ SR2  ]
          // [ op code ] [  DR  ] [ SR1  ] 1  [    imm5    ]

          const r0 = (instruction >> 9) & 0x7;
          const r1 = (instruction >> 6) & 0x7;
          const imm_flag = (instruction >> 5) & 0x1;

          if (imm_flag) {
            const imm5 = this.signExtend(instruction & 0x1f, 5);
            this.registers[r0] = (this.registers[r1] + imm5) & 0xffff;
          } else {
            const r2 = instruction & 0x7;
            this.registers[r0] =
              (this.registers[r1] + this.registers[r2]) & 0xffff;
          }

          this.updateFlags(r0);
          break;
        }
        case OPCode.AND: {
          const r0 = (instruction >> 9) & 0x7;
          const r1 = (instruction >> 6) & 0x7;
          const imm_flag = (instruction >> 5) & 0x1;

          if (imm_flag) {
            const imm5 = this.signExtend(instruction & 0x1f, 5);
            this.registers[r0] = this.registers[r1] & imm5;
          } else {
            const r2 = instruction & 0x7;
            this.registers[r0] = this.registers[r1] & this.registers[r2];
          }

          this.updateFlags(r0);
          break;
        }
        case OPCode.NOT: {
          const r0 = (instruction >> 9) & 0x7;
          const r1 = (instruction >> 6) & 0x7;

          this.registers[r0] = ~this.registers[r1] & 0xffff;
          this.updateFlags(r0);
          break;
        }
        case OPCode.BR: {
          const pcOffset = this.signExtend(instruction & 0x1ff, 9);
          const condFlags = (instruction >> 9) & 0x7;
          if (condFlags & this.registers[Register.RCOND]) {
            this.registers[Register.RPC] =
              (this.registers[Register.RPC] + pcOffset) & 0xffff;
          }
          break;
        }
        case OPCode.JMP: {
          const baseReg = (instruction >> 6) & 0x7;
          this.registers[Register.RPC] = this.registers[baseReg];
          break;
        }
        case OPCode.JSR: {
          this.registers[Register.R7] = this.registers[Register.RPC];
          const offsetFlag = (instruction >> 11) & 1;
          if (offsetFlag) {
            this.registers[Register.RPC] =
              (this.registers[Register.RPC] +
                this.signExtend(instruction & 0x7ff, 11)) &
              0xffff;
          } else {
            const baseReg = (instruction >> 6) & 0x7;
            this.registers[Register.RPC] = this.registers[baseReg];
          }
          break;
        }
        case OPCode.LD: {
          const r0 = (instruction >> 9) & 0x7;
          const pcOffset = this.signExtend(instruction & 0x1ff, 9);
          this.registers[r0] = this.memRead(
            (this.registers[Register.RPC] + pcOffset) & 0xffff
          );
          this.updateFlags(r0);
          break;
        }
        case OPCode.LDI: {
          const r0 = (instruction >> 9) & 0x7;
          const pcOffset = this.signExtend(instruction & 0x1ff, 9);
          this.registers[r0] = this.memRead(
            this.memRead(this.registers[Register.RPC] + pcOffset)
          );
          this.updateFlags(r0);
          break;
        }
        case OPCode.LDR: {
          const r0 = (instruction >> 9) & 0x7;
          const baseReg = (instruction >> 6) & 0x7;
          const pcOffset = this.signExtend(instruction & 0x3f, 6);
          this.registers[r0] = this.memRead(
            (this.registers[baseReg] + pcOffset) & 0xffff
          );
          this.updateFlags(r0);
          break;
        }
        case OPCode.LEA: {
          const r0 = (instruction >> 9) & 0x7;
          const pcOffset = this.signExtend(instruction & 0x1ff, 9);
          this.registers[r0] =
            (this.registers[Register.RPC] + pcOffset) & 0xffff;
          this.updateFlags(r0);
          break;
        }
        case OPCode.ST: {
          const r0 = (instruction >> 9) & 0x7;
          const pcOffset = this.signExtend(instruction & 0x1ff, 9);
          this.memWrite(
            (this.registers[Register.RPC] + pcOffset) & 0xffff,
            this.registers[r0]
          );
          break;
        }
        case OPCode.STI: {
          const r0 = (instruction >> 9) & 0x7;
          const pcOffset = this.signExtend(instruction & 0x1ff, 9);
          this.memWrite(
            this.memRead((this.registers[Register.RPC] + pcOffset) & 0xffff),
            this.registers[r0]
          );
          break;
        }
        case OPCode.STR: {
          const r0 = (instruction >> 9) & 0x7;
          const baseReg = (instruction >> 6) & 0x7;
          const offset = this.signExtend(instruction & 0x3f, 6);
          this.memWrite(
            (this.registers[baseReg] + offset) & 0xffff,
            this.registers[r0]
          );
          break;
        }
        case OPCode.TRAP: {
          this.registers[Register.R7] = this.registers[Register.RPC];

          switch (instruction & 0xff) {
            case TRAPCode.GETC: {
              this.registers[Register.R0] = this.io.getChar();
              this.updateFlags(Register.R0);
              break;
            }
            case TRAPCode.OUT: {
              let char = this.registers[Register.R0];
              this.io.putChar(char);
              break;
            }
            case TRAPCode.PUTS: {
              let address = this.registers[Register.R0];
              let char = this.memRead(address);
              while (char) {
                this.io.putChar(char);
                address++;
                char = this.memRead(address);
              }
              break;
            }
            case TRAPCode.IN: {
              this.io.print("Enter a character: ");
              let char = this.io.getChar();
              this.io.putChar(char);
              this.registers[Register.R0] = char;
              this.updateFlags(Register.R0);
              break;
            }
            case TRAPCode.PUTSP: {
              let address = this.registers[Register.R0];
              let char = this.memRead(address);
              while (char) {
                const char1 = char & 0xff;
                this.io.putChar(char1);
                const char2 = char >> 8;
                if (char2) {
                  this.io.putChar(char2);
                }
                address++;
                char = this.memRead(address);
              }
              break;
            }
            case TRAPCode.HALT: {
              this.io.print("HALT\n");
              running = false;
              break;
            }
          }
          break;
        }
        case OPCode.RES:
        case OPCode.RTI:
        default:
          throw new Error("Unused op code");
      }
    }
  }

  public signExtend(x: Uint16, bitCount: number) {
    if ((x >> (bitCount - 1)) & 1) {
      x |= 0xffff << bitCount;
    }
    return x & 0xffff;
  }

  private updateFlags(reg: Uint16) {
    if (this.registers[reg] === 0) {
      this.registers[Register.RCOND] = Flag.ZRO;
    } else if (this.registers[reg] >> 15) {
      this.registers[Register.RCOND] = Flag.NEG;
    } else {
      this.registers[Register.RCOND] = Flag.POS;
    }
  }

  private memRead(address: Uint16) {
    if (address == MMRegister.KBSR) {
      const input = this.io.getChar();
      if (input) {
        this.memory[MMRegister.KBSR] = 1 << 15;
        this.memory[MMRegister.KBDR] = input;
      } else {
        this.memory[MMRegister.KBSR] = 0x00;
      }
    }
    return this.memory[address];
  }

  private memWrite(address: Uint16, value: Uint16) {
    this.memory[address] = value;
  }

  private formatUint16AsBin(num: Uint16) {
    return num
      .toString(2)
      .padStart(16, "0")
      .match(/[0-1]{4}/g)!
      .join(" ");
  }
}

type Uint16 = number;
