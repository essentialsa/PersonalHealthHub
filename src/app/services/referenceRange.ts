/**
 * 共享参考范围工具：解析检验报告参考范围文本、判定数值状态、计算雷达评分。
 * 参考范围几乎不含负数，因此约定：分隔符（- ~ ～ – — －）两侧都是数字时按双侧解析。
 */

export interface ParsedRange {
  min?: number;
  max?: number;
}

export type ValueStatus = "above" | "below" | "normal" | "unknown";

const NUM = "\\d+(?:\\.\\d+)?";
// 双侧：3.9-6.1 / 4.0 - 10.0 / 2.8~5.7 / 3.9～6.1 / 3.9–6.1 / 3.9—6.1 / 3.9－6.1
const TWO_SIDED = new RegExp(`(${NUM})\\s*[-~～\\u2013\\u2014\\uFF0D]\\s*(${NUM})`);
// 单侧比较符：<5.2 ≤5.2 ＜5.2 >200 ≥150 ＞3.0（可带空格，后随单位文字）
const LE_COMPARATOR = new RegExp(`[<≤\\uFF1C]\\s*(${NUM})`);
const GE_COMPARATOR = new RegExp(`[>≥\\uFF1E]\\s*(${NUM})`);
// 中文后缀：5.2以下 / 150以上
const CN_MAX = new RegExp(`(${NUM})\\s*以下`);
const CN_MIN = new RegExp(`(${NUM})\\s*以上`);

export function parseReferenceRange(text?: string | null): ParsedRange | null {
  if (text == null) return null;
  const s = String(text).trim();
  if (!s) return null;

  // 优先双侧：避免把 "3.9-6.1" 错拆成单侧
  const two = s.match(TWO_SIDED);
  if (two) {
    let min = parseFloat(two[1]);
    let max = parseFloat(two[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (min > max) [min, max] = [max, min];
    return { min, max };
  }

  const le = s.match(LE_COMPARATOR);
  if (le) {
    const max = parseFloat(le[1]);
    return Number.isFinite(max) ? { max } : null;
  }
  const ge = s.match(GE_COMPARATOR);
  if (ge) {
    const min = parseFloat(ge[1]);
    return Number.isFinite(min) ? { min } : null;
  }
  const cnMax = s.match(CN_MAX);
  if (cnMax) {
    const max = parseFloat(cnMax[1]);
    return Number.isFinite(max) ? { max } : null;
  }
  const cnMin = s.match(CN_MIN);
  if (cnMin) {
    const min = parseFloat(cnMin[1]);
    return Number.isFinite(min) ? { min } : null;
  }
  return null;
}

export function getValueStatus(
  value: unknown,
  referenceRange?: string | null,
  flag?: "H" | "L" | null
): ValueStatus {
  // value 必须是有限数值，否则一律 unknown（不得按 0 判定）
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";

  const range = parseReferenceRange(referenceRange);
  if (range) {
    if (range.max !== undefined && value > range.max) return "above";
    if (range.min !== undefined && value < range.min) return "below";
    return "normal";
  }
  if (flag === "H") return "above";
  if (flag === "L") return "below";
  return "unknown";
}

/**
 * 雷达评分公式（审计用）：
 * - 双侧 [min,max]，span = max−min > 0：
 *   p = (v−min)/span
 *   0≤p≤1：score = 60 + 40×(1−|2p−1|)   （边缘 60，中心 100）
 *   p 超出 [0,1]：score = max(0, 60 − 120×(超出量/span))
 * - 仅上限 max（max>0）：
 *   v ≤ max：score = 90 + 10×(1 − v/max)
 *   v > max：score = max(0, 90 − 90×(v−max)/max)
 * - 仅下限 min（min>0）：
 *   v ≥ min：90；v < min：score = max(0, 90×v/min)
 */
export function scoreAgainstRange(
  value: unknown,
  referenceRange?: string | null
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const range = parseReferenceRange(referenceRange);
  if (!range) return null;

  const { min, max } = range;
  if (min !== undefined && max !== undefined) {
    const span = max - min;
    if (span <= 0) return null;
    const p = (value - min) / span;
    if (p >= 0 && p <= 1) {
      return 60 + 40 * (1 - Math.abs(2 * p - 1));
    }
    const excess = p < 0 ? -p * span : (p - 1) * span;
    return Math.max(0, 60 - 120 * (excess / span));
  }
  if (max !== undefined) {
    if (max <= 0) return null;
    if (value <= max) return 90 + 10 * (1 - value / max);
    return Math.max(0, 90 - (90 * (value - max)) / max);
  }
  if (min !== undefined) {
    if (min <= 0) return null;
    if (value >= min) return 90;
    return Math.max(0, (90 * value) / min);
  }
  return null;
}
