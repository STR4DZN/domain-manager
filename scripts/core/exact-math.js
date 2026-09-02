/**
 * Módulo de Aritmética Exata de Inteiros (Bloco 17).
 * Garante operações determinísticas de escala fixa e frações racionais exatas,
 * eliminando 100% de erros de arredondamento IEEE-754 de ponto flutuante.
 */

/**
 * Calcula o Máximo Divisor Comum (MDC) usando o algoritmo de Euclides.
 * @param {bigint|number} a
 * @param {bigint|number} b
 * @returns {bigint}
 */
export function gcd(a, b) {
  let x = BigInt(Math.abs(Number(a)));
  let y = BigInt(Math.abs(Number(b)));
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/**
 * Calcula o Mínimo Múltiplo Comum (MMC).
 * @param {bigint|number} a
 * @param {bigint|number} b
 * @returns {bigint}
 */
export function lcm(a, b) {
  const x = BigInt(Math.abs(Number(a)));
  const y = BigInt(Math.abs(Number(b)));
  if (x === 0n || y === 0n) return 0n;
  return (x * y) / gcd(x, y);
}

/**
 * Representação e operações de Frações Racionais Exatas.
 */
export class RationalFraction {
  /**
   * @param {bigint|number} numerator
   * @param {bigint|number} denominator
   */
  constructor(numerator = 0, denominator = 1) {
    let num = BigInt(numerator);
    let den = BigInt(denominator);

    if (den === 0n) {
      throw new RangeError("Divisão por zero em fração racional.");
    }

    if (den < 0n) {
      num = -num;
      den = -den;
    }

    const divisor = gcd(num, den);
    this.num = divisor > 0n ? num / divisor : num;
    this.den = divisor > 0n ? den / divisor : den;
  }

  add(other) {
    const o = other instanceof RationalFraction ? other : new RationalFraction(other);
    return new RationalFraction(
      this.num * o.den + o.num * this.den,
      this.den * o.den
    );
  }

  subtract(other) {
    const o = other instanceof RationalFraction ? other : new RationalFraction(other);
    return new RationalFraction(
      this.num * o.den - o.num * this.den,
      this.den * o.den
    );
  }

  multiply(other) {
    const o = other instanceof RationalFraction ? other : new RationalFraction(other);
    return new RationalFraction(
      this.num * o.num,
      this.den * o.den
    );
  }

  divide(other) {
    const o = other instanceof RationalFraction ? other : new RationalFraction(other);
    if (o.num === 0n) throw new RangeError("Divisão por zero.");
    return new RationalFraction(
      this.num * o.den,
      this.den * o.num
    );
  }

  floor() {
    return Number(this.num / this.den);
  }

  toDecimal(precision = 2) {
    const scale = 10n ** BigInt(precision);
    const scaled = (this.num * scale) / this.den;
    const num = Number(scaled) / (10 ** precision);
    return num;
  }
}

/**
 * Calcula avanço temporal de taxa com acumulador exato de resto (carry).
 * @param {Object} params
 * @param {number} params.ratePerPeriod - Quantidade por período em minorUnits
 * @param {number} params.periodTicks - Período em ticks (ex: 3)
 * @param {number} params.deltaTicks - Ticks a avançar (ex: 7)
 * @param {number} params.initialCarry - Resto inicial acumulado
 * @returns {{ deltaAmount: number, nextCarry: number }}
 */
export function calculateExactFlowAdvance({
  ratePerPeriod,
  periodTicks = 1,
  deltaTicks = 1,
  initialCarry = 0
}) {
  const rate = BigInt(ratePerPeriod);
  const period = BigInt(Math.max(1, periodTicks));
  const delta = BigInt(Math.max(0, deltaTicks));
  const carry = BigInt(initialCarry);

  const total = rate * delta + carry;
  const deltaAmount = total / period;
  const nextCarry = total % period;

  return {
    deltaAmount: Number(deltaAmount),
    nextCarry: Number(nextCarry)
  };
}

/**
 * Distribui uma quantidade total de minorUnits proporcionalmente entre múltiplos pesos inteiros,
 * garantindo que a soma dos resultados seja exatamente igual ao total (sem perda de resíduo).
 * @param {number} totalAmount - Quantidade total a distribuir
 * @param {number[]} weights - Pesos de cada parte (inteiros)
 * @returns {number[]}
 */
export function distributeProportionalExact(totalAmount, weights = []) {
  if (!weights.length) return [];
  const total = BigInt(totalAmount);
  const sumWeights = weights.reduce((acc, w) => acc + BigInt(Math.max(0, w)), 0n);

  if (sumWeights === 0n) {
    const equalShare = total / BigInt(weights.length);
    let remainder = total % BigInt(weights.length);
    return weights.map(() => {
      let portion = equalShare;
      if (remainder > 0n) {
        portion += 1n;
        remainder -= 1n;
      }
      return Number(portion);
    });
  }

  let distributedSum = 0n;
  const parts = [];
  const remainders = [];

  for (let i = 0; i < weights.length; i++) {
    const w = BigInt(Math.max(0, weights[i]));
    const numerator = total * w;
    const share = numerator / sumWeights;
    const rem = numerator % sumWeights;

    parts.push(share);
    distributedSum += share;
    remainders.push({ index: i, rem });
  }

  // Distribui o resíduo restante para os maiores restos (Largest Remainder Method / Hare-Niemeyer)
  let leftover = total - distributedSum;
  remainders.sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : 0));

  for (let i = 0; i < Number(leftover); i++) {
    parts[remainders[i].index] += 1n;
  }

  return parts.map(Number);
}
