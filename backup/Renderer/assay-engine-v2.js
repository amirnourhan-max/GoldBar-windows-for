(() => {
  'use strict';

  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function roundDownTowardZero(value, digits = 0) {
    if (!Number.isFinite(value)) return NaN;
    const factor = 10 ** digits;
    const scaled = value * factor;
    return Math.trunc(scaled) / factor;
  }

  function summarize(entries) {
    let weight = 0;
    let weightedSum = 0;
    let count = 0;
    for (const item of Array.isArray(entries) ? entries : []) {
      const w = finite(item?.weight);
      const a = finite(item?.assay);
      if (!(w > 0) || !(a > 0) || a > 1000) continue;
      weight += w;
      weightedSum += w * a;
      count++;
    }
    return {
      count,
      weight,
      weightedSum,
      averageAssay: weight > 0 ? weightedSum / weight : NaN
    };
  }

  // Workbook Table1 / AB3:
  // difference = castingAssay - currentWeightedAssay
  // denominator = barAssay - castingAssay
  // requiredBar = ROUNDDOWN(weight * difference / denominator, 1)
  function increaseAssay(summary, castingAssay, barAssay) {
    const target = finite(castingAssay);
    const bar = finite(barAssay);
    const current = finite(summary?.averageAssay);
    const weight = finite(summary?.weight);
    if (!(weight > 0) || !Number.isFinite(current) || !Number.isFinite(target) || !Number.isFinite(bar)) {
      return { assayDifference: NaN, denominator: NaN, requiredBar: NaN };
    }
    const assayDifference = target - current;
    const denominator = bar - target;
    const requiredBar = denominator === 0 ? NaN : roundDownTowardZero(weight * assayDifference / denominator, 1);
    return { assayDifference, denominator, requiredBar };
  }

  // Workbook Table14 / Y6, AB6, AB7, AB8, AB10:
  // totalAlloy = weight * currentWeightedAssay / castingAssay - weight
  // silver = silverPercent / 100 * totalAlloy
  // nonSilver = totalAlloy - silver
  // fourPerThousand = globalWeight * 0.004
  // finalOther = totalAlloy - silver - fourPerThousand
  // totalAfter = weight + totalAlloy
  function alloyForTarget(summary, castingAssay, silverPercent, globalWeight = summary?.weight) {
    const target = finite(castingAssay);
    const silverPct = finite(silverPercent);
    const current = finite(summary?.averageAssay);
    const weight = finite(summary?.weight);
    const gWeight = finite(globalWeight);
    if (!(weight > 0) || !Number.isFinite(current) || !Number.isFinite(target) || target === 0 || !Number.isFinite(silverPct)) {
      return {
        totalAlloyRequired: NaN,
        silverRequired: NaN,
        nonSilverRequired: NaN,
        fourPerThousand: NaN,
        finalOtherAlloy: NaN,
        totalAfterAlloy: NaN
      };
    }
    const totalAlloyRequired = weight * current / target - weight;
    const silverRequired = silverPct / 100 * totalAlloyRequired;
    const nonSilverRequired = totalAlloyRequired - silverRequired;
    const fourPerThousand = Number.isFinite(gWeight) ? gWeight * 0.004 : NaN;
    const finalOtherAlloy = totalAlloyRequired - silverRequired - fourPerThousand;
    const totalAfterAlloy = weight + totalAlloyRequired;
    return {
      totalAlloyRequired,
      silverRequired,
      nonSilverRequired,
      fourPerThousand,
      finalOtherAlloy,
      totalAfterAlloy
    };
  }

  function splitByPercent(base, percent995, percent750) {
    const b = finite(base);
    const p995 = finite(percent995);
    const p750 = finite(percent750);
    return {
      gold995: Number.isFinite(b) && Number.isFinite(p995) ? b * p995 / 100 : NaN,
      gold750: Number.isFinite(b) && Number.isFinite(p750) ? b * p750 / 100 : NaN,
      totalPercent: Number.isFinite(p995) && Number.isFinite(p750) ? p995 + p750 : NaN
    };
  }

  // Workbook W10:
  // addition = baseWeight * baseAssay / (baseAssay - assayDrop) - baseWeight
  function correctionForDrop(baseWeight, baseAssay, assayDrop) {
    const w = finite(baseWeight);
    const base = finite(baseAssay);
    const drop = finite(assayDrop);
    const denominator = base - drop;
    if (!Number.isFinite(w) || !Number.isFinite(base) || !Number.isFinite(drop) || denominator === 0) return NaN;
    return w * base / denominator - w;
  }

  function probeWorkbookReference() {
    const summary = { weight: 353.11, averageAssay: 775.5433717538443 };
    const inc = increaseAssay(summary, 747, 995);
    const alloy = alloyForTarget(summary, 747, 45, 353.11);
    const split = splitByPercent(800, 36.79, 63.21);
    const correction = correctionForDrop(250, 750, 1);
    const close = (a, b, eps = 1e-9) => Number.isFinite(a) && Math.abs(a - b) <= eps;
    const checks = {
      increase: close(inc.requiredBar, -40.6),
      totalAlloy: close(alloy.totalAlloyRequired, 13.492570281124472),
      silver: close(alloy.silverRequired, 6.071656626506012),
      nonSilver: close(alloy.nonSilverRequired, 7.4209136546184595),
      fourPerThousand: close(alloy.fourPerThousand, 1.4124400000000001),
      finalOther: close(alloy.finalOtherAlloy, 6.008473654618459),
      split995: close(split.gold995, 294.32),
      split750: close(split.gold750, 505.68),
      correction: close(correction, 0.33377837116154296)
    };
    return { ok: Object.values(checks).every(Boolean), checks, inc, alloy, split, correction };
  }

  window.__goldbarAssayEngineV2 = {
    roundDownTowardZero,
    summarize,
    increaseAssay,
    alloyForTarget,
    splitByPercent,
    correctionForDrop,
    probeWorkbookReference
  };
})();
