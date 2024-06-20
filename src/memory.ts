export const createMemory = (size: number) => {
  const buf = new ArrayBuffer(size * 2);
  return new Uint16Array(buf);
};
