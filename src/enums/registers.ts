export enum Register {
  R0 = 0,
  R1,
  R2,
  R3,
  R4,
  R5,
  R6,
  R7,
  RPC /* Program Counter */,
  RCOND /* Condition Flags */,
  RCOUNT,
}

export enum MMRegister {
  KBSR = 0xfe00 /* keyboard status */,
  KBDR = 0xfe02 /* keyboard data */,
}
