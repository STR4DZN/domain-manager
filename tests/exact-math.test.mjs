import test from "node:test";
import assert from "node:assert/strict";

import { calculateExactFlowAdvance } from "../scripts/core/exact-math.js";

test("fluxo 1/3 acumula carry sem perder frações", () => {
  const a = calculateExactFlowAdvance({ ratePerPeriod: 1, periodTicks: 3, deltaTicks: 1, initialCarry: 0 });
  assert.deepEqual(a, { deltaAmount: 0, nextCarry: 1 });

  const b = calculateExactFlowAdvance({ ratePerPeriod: 1, periodTicks: 3, deltaTicks: 1, initialCarry: a.nextCarry });
  assert.deepEqual(b, { deltaAmount: 0, nextCarry: 2 });

  const c = calculateExactFlowAdvance({ ratePerPeriod: 1, periodTicks: 3, deltaTicks: 1, initialCarry: b.nextCarry });
  assert.deepEqual(c, { deltaAmount: 1, nextCarry: 0 });
});

test("advance(3) equivale a três advance(1) na aritmética de fluxo", () => {
  const bulk = calculateExactFlowAdvance({ ratePerPeriod: 1, periodTicks: 3, deltaTicks: 3, initialCarry: 0 });

  let carry = 0;
  let amount = 0;
  for (let i = 0; i < 3; i++) {
    const step = calculateExactFlowAdvance({ ratePerPeriod: 1, periodTicks: 3, deltaTicks: 1, initialCarry: carry });
    amount += step.deltaAmount;
    carry = step.nextCarry;
  }

  assert.equal(amount, bulk.deltaAmount);
  assert.equal(carry, bulk.nextCarry);
});
