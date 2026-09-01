'use strict';

function assertBuffer(value) {
  if (!Buffer.isBuffer(value)) throw new TypeError('Expected a Buffer');
}

function assertWidth(width) {
  if (!Number.isSafeInteger(width) || width < 0) throw new RangeError('width must be a non-negative safe integer');
}

function toBigIntBE(buf) {
  assertBuffer(buf);
  const hex = buf.toString('hex');
  return hex ? BigInt(`0x${hex}`) : 0n;
}

function toBigIntLE(buf) {
  assertBuffer(buf);
  return toBigIntBE(Buffer.from(buf).reverse());
}

function toBufferBE(num, width) {
  if (typeof num !== 'bigint' || num < 0n) throw new RangeError('num must be a non-negative bigint');
  assertWidth(width);
  const hex = num.toString(16);
  if (hex.length > width * 2) throw new RangeError('bigint does not fit in width');
  return Buffer.from(hex.padStart(width * 2, '0'), 'hex');
}

function toBufferLE(num, width) {
  return toBufferBE(num, width).reverse();
}

module.exports = { toBigIntLE, toBigIntBE, toBufferLE, toBufferBE };
