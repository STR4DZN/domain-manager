import {
  assertSafeMinorAmount,
  formatMinorUnits
} from "../../core/numbers.js";

function absBigInt(value) {
  return value < 0n ? -value : value;
}

function gcd(a, b) {
  let x = absBigInt(a);
  let y = absBigInt(b);

  while (y !== 0n) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }

  return x || 1n;
}

function reduceFraction(
  numerator,
  denominator
) {
  if (denominator === 0n) {
    throw new RangeError(
      "Denominador não pode ser zero."
    );
  }

  let n = numerator;
  let d = denominator;

  if (d < 0n) {
    n = -n;
    d = -d;
  }

  const divisor = gcd(n, d);

  return {
    numerator: n / divisor,
    denominator: d / divisor
  };
}

function addFractions(
  left,
  right
) {
  return reduceFraction(
    left.numerator * right.denominator
      + right.numerator * left.denominator,
    left.denominator * right.denominator
  );
}

function signedFlowFraction(flow) {
  const sign =
    flow.direction === "outflow"
      ? -1n
      : 1n;

  const period = Math.max(1, Math.floor(Number(flow.periodTicks) || 1));

  return reduceFraction(
    sign * BigInt(flow.amount || 0),
    BigInt(period)
  );
}

export function sumFlowRates(flows) {
  let total = {
    numerator: 0n,
    denominator: 1n
  };

  for (const flow of flows ?? []) {
    if (!flow.active) continue;

    total = addFractions(
      total,
      signedFlowFraction(flow)
    );
  }

  return total;
}

export function formatFlowRateDisplay(
  numerator,
  denominator,
  precision = 2
) {
  if (numerator === 0n) {
    return precision > 0 ? "0," + "0".repeat(precision) : "0";
  }

  const isNegative = numerator < 0n;
  const n = absBigInt(numerator);

  const minorScale = 10n ** BigInt(precision);
  const displayDecimals = Math.max(0, precision);
  const displayScale = 10n ** BigInt(displayDecimals);

  const scaled = (n * displayScale) / (denominator * minorScale);
  const whole = scaled / displayScale;
  const fraction = displayDecimals > 0
    ? String(scaled % displayScale).padStart(displayDecimals, "0")
    : "";

  const sign = isNegative ? "-" : "+";
  return fraction ? `${sign}${whole},${fraction}` : `${sign}${whole}`;
}

function reservationTotal(
  reservations,
  resourceId
) {
  let total = 0;

  for (
    const reservation
    of reservations ?? []
  ) {
    if (
      reservation.resourceId
      !== resourceId
    ) {
      continue;
    }

    assertSafeMinorAmount(
      reservation.amount
    );

    if (reservation.amount < 0) {
      throw new RangeError(
        "Reserva não pode ser negativa."
      );
    }

    total += reservation.amount;
    assertSafeMinorAmount(total);
  }

  return total;
}

export function buildResourceLedger({
  resource,
  stockAmount = 0,
  flows = [],
  reservations = [],
  policy = null
}) {
  assertSafeMinorAmount(stockAmount);

  const resourceFlows =
    flows.filter(
      (flow) =>
        flow.resourceId === resource.id
    );

  const resourceReservations =
    (reservations ?? []).filter(
      (reservation) =>
        reservation.resourceId === resource.id
    );

  const reserved =
    reservationTotal(
      resourceReservations,
      resource.id
    );

  const available =
    stockAmount - reserved;

  assertSafeMinorAmount(available);

  const rate =
    sumFlowRates(resourceFlows);

  const netDirection =
    rate.numerator > 0n
      ? "positive"
      : rate.numerator < 0n
        ? "negative"
        : "zero";

  const inflowRate = sumFlowRates(resourceFlows.filter((flow) => flow.direction !== "outflow"));
  const outflowRateSigned = sumFlowRates(resourceFlows.filter((flow) => flow.direction === "outflow"));
  const outflowRate = { numerator: absBigInt(outflowRateSigned.numerator), denominator: outflowRateSigned.denominator };

  let runwayTicksFloor = null;

  if (
    rate.numerator < 0n
    && available > 0
  ) {
    const ticks =
      (
        BigInt(available)
        * rate.denominator
      )
      / absBigInt(rate.numerator);

    if (
      ticks <= BigInt(
        Number.MAX_SAFE_INTEGER
      )
    ) {
      runwayTicksFloor = Number(ticks);
    }
  }

  const normalizedPolicy = {
    criticalFloor: Math.max(0, Number(policy?.criticalFloor ?? 0)),
    reserveTarget: Math.max(0, Number(policy?.reserveTarget ?? 0)),
    storageCapacity: Math.max(0, Number(policy?.storageCapacity ?? 0))
  };
  const reserveGap = Math.max(0, normalizedPolicy.reserveTarget - Math.max(0, available));
  const capacityHeadroom = normalizedPolicy.storageCapacity > 0
    ? Math.max(0, normalizedPolicy.storageCapacity - Math.max(0, stockAmount))
    : null;
  const storageUtilizationPercent = normalizedPolicy.storageCapacity > 0
    ? Math.max(0, Math.floor((Math.max(0, stockAmount) * 100) / normalizedPolicy.storageCapacity))
    : null;
  const critical = normalizedPolicy.criticalFloor > 0 && available <= normalizedPolicy.criticalFloor;
  const belowReserve = normalizedPolicy.reserveTarget > 0 && available < normalizedPolicy.reserveTarget;
  const overCapacity = normalizedPolicy.storageCapacity > 0 && stockAmount > normalizedPolicy.storageCapacity;

  return {
    resourceId: resource.id,
    stock: stockAmount,
    reserved,
    available,
    overReserved: reserved > stockAmount,
    policy: normalizedPolicy,
    reserveGap,
    capacityHeadroom,
    storageUtilizationPercent,
    critical,
    belowReserve,
    overCapacity,

    stockDisplay:
      formatMinorUnits(
        stockAmount,
        resource.precision
      ),

    reservedDisplay:
      formatMinorUnits(
        reserved,
        resource.precision
      ),

    availableDisplay:
      formatMinorUnits(
        available,
        resource.precision
      ),

    rateExact: {
      numerator:
        String(rate.numerator),
      denominator:
        String(rate.denominator)
    },

    netPerTickDisplay:
      formatFlowRateDisplay(
        rate.numerator,
        rate.denominator,
        resource.precision
      ),

    grossInPerTickDisplay:
      formatFlowRateDisplay(
        inflowRate.numerator,
        inflowRate.denominator,
        resource.precision
      ),

    grossOutPerTickDisplay:
      formatFlowRateDisplay(
        -outflowRate.numerator,
        outflowRate.denominator,
        resource.precision
      ),

    netDirection,
    runwayTicksFloor,

    pressure:
      rate.numerator < 0n
      && available <= 0,

    reservationContributions:
      resourceReservations.map(
        (reservation) => ({
          source:
            reservation.source
            || "Reserva",
          sourceUuid:
            reservation.sourceUuid
            ?? null,
          amount:reservation.amount,
          display:
            formatMinorUnits(
              reservation.amount,
              resource.precision
            )
        })
      ),

    contributions:
      resourceFlows.map((flow) => ({
        localId: flow.localId,
        name: flow.name,
        direction: flow.direction,
        amount: flow.amount,
        periodTicks: flow.periodTicks,
        active: flow.active,
        source: flow.source,
        display:
          formatMinorUnits(
            flow.amount,
            resource.precision
          )
      }))
  };
}

export function buildDomainLedger({
  catalog,
  economy,
  reservations = [],
  flows = null
}) {
  const stocks = new Map(
    (economy?.stocks ?? [])
      .map(
        (stock) => [
          stock.resourceId,
          stock.amount
        ]
      )
  );

  const policyMap = new Map((economy?.resourcePolicies ?? []).map((policy) => [policy.resourceId, policy]));
  const effectiveFlows = flows ?? economy?.flows ?? [];

  return (catalog?.resources ?? [])
    .map(
      (resource) =>
        buildResourceLedger({
          resource,
          stockAmount:
            stocks.get(resource.id) ?? 0,
          flows: effectiveFlows,
          reservations,
          policy: policyMap.get(resource.id) ?? null
        })
    );
}
