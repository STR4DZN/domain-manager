import {
  ECONOMY_LIMITS
} from "./constants.js";

export function assertPrecision(precision) {
  if (
    !Number.isInteger(precision)
    || precision < 0
    || precision > ECONOMY_LIMITS.MAX_PRECISION
  ) {
    throw new RangeError(
      `Precisão deve estar entre 0 e ${ECONOMY_LIMITS.MAX_PRECISION}.`
    );
  }
}

export function minorUnitScale(precision) {
  assertPrecision(precision);
  return 10 ** precision;
}

export function assertSafeMinorAmount(amount) {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(
      "Quantidade interna precisa ser um inteiro seguro."
    );
  }

  if (
    Math.abs(amount)
    > ECONOMY_LIMITS.MAX_MINOR_AMOUNT
  ) {
    throw new RangeError(
      `Quantidade excede o limite técnico de ${ECONOMY_LIMITS.MAX_MINOR_AMOUNT}.`
    );
  }

  return amount;
}

export function parseMinorUnits(
  rawValue,
  precision
) {
  assertPrecision(precision);

  const rawStr = String(rawValue ?? "").trim();
  if (!rawStr) return 0;

  let normalized = rawStr;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  } else if (normalized.includes(".")) {
    const dotCount = (normalized.match(/\./g) || []).length;
    if (dotCount > 1 || (precision === 0 && /^[+-]?\d{1,3}(\.\d{3})+$/.test(normalized))) {
      normalized = normalized.replace(/\./g, "");
    }
  }

  const match = normalized.match(
    /^([+-]?)(\d+)(?:\.(\d+))?$/
  );

  if (!match) {
    throw new TypeError(
      `Valor inválido: ${rawValue}`
    );
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2];
  const fraction = match[3] ?? "";

  if (fraction.length > precision) {
    const excess = fraction.slice(precision);

    if (!/^0*$/.test(excess)) {
      throw new RangeError(
        `Este recurso aceita no máximo ${precision} casa(s) decimal(is).`
      );
    }
  }

  const paddedFraction =
    fraction.slice(0, precision)
      .padEnd(precision, "0");

  const digits =
    `${whole}${paddedFraction}` || "0";

  const resultBigInt =
    sign * BigInt(digits);

  const max =
    BigInt(ECONOMY_LIMITS.MAX_MINOR_AMOUNT);

  if (
    resultBigInt > max
    || resultBigInt < -max
  ) {
    throw new RangeError(
      "Valor excede o limite técnico do módulo."
    );
  }

  return Number(resultBigInt);
}

export function formatMinorUnits(
  amount,
  precision,
  {
    decimalSeparator = ",",
    thousandSeparator = ".",
    trimTrailingZeros = false
  } = {}
) {
  assertPrecision(precision);
  assertSafeMinorAmount(amount);

  const negative = amount < 0;
  const absolute = Math.abs(amount);
  const scale = minorUnitScale(precision);

  const whole = Math.floor(absolute / scale);
  const fraction =
    String(absolute % scale)
      .padStart(precision, "0");

  let wholeFormatted = String(whole);
  if (thousandSeparator) {
    wholeFormatted = wholeFormatted.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator);
  }

  let output = wholeFormatted;

  if (precision > 0) {
    let visibleFraction = fraction;

    if (trimTrailingZeros) {
      visibleFraction =
        visibleFraction.replace(/0+$/, "");
    }

    if (visibleFraction) {
      output +=
        `${decimalSeparator}${visibleFraction}`;
    }
  }

  return negative ? `-${output}` : output;
}

