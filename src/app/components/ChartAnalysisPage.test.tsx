import { describe, expect, it } from "vitest";
import { buildRadarData, type RadarSeries } from "@/app/components/ChartAnalysisPage";

const series = (label: string, referenceRange: string | undefined, values: number[]): RadarSeries => ({
  item: { label, referenceRange },
  points: values.map(value => ({ value })),
});

describe("buildRadarData", () => {
  it("历史全部偏高的 LDL 得分显著低于范围内指标，并出现在待改善", () => {
    // LDL 历史值全部偏高（参考范围 <3.4），旧 min-max 归一化会给出满分
    const ldl = series("低密度脂蛋白", "<3.4", [4.0, 4.1, 4.01]);
    const glucose = series("空腹血糖", "3.9-6.1", [4.8, 5.0, 5.0]);
    const uricAcid = series("尿酸", "208-428", [300, 320, 318]);

    const result = buildRadarData([ldl, glucose, uricAcid]);

    expect(result).not.toBeNull();
    const scores = Object.fromEntries(result!.data.map(entry => [entry.indicator, entry.score]));
    expect(scores["低密度脂蛋白"]).toBeLessThan(80);
    expect(scores["空腹血糖"]).toBeGreaterThan(90);
    expect(scores["尿酸"]).toBeGreaterThan(90);
    expect(result!.worst).toBe("低密度脂蛋白");
  });

  it("无参考范围的指标不纳入雷达", () => {
    const a = series("指标A", "3.9-6.1", [5.0]);
    const b = series("指标B", "2.8-5.7", [4.0]);
    const c = series("指标C", "0-100", [50]);
    const noRange = series("无参考指标", undefined, [999]);

    const result = buildRadarData([a, b, c, noRange]);

    expect(result).not.toBeNull();
    expect(result!.data).toHaveLength(3);
    expect(result!.data.map(entry => entry.indicator)).not.toContain("无参考指标");
  });

  it("可评分指标不足 3 个时返回 null", () => {
    const a = series("指标A", "3.9-6.1", [5.0]);
    const b = series("指标B", "2.8-5.7", [4.0]);
    const noRange = series("无参考指标", undefined, [1]);

    expect(buildRadarData([a, b, noRange])).toBeNull();
    expect(buildRadarData([a, b])).toBeNull();
  });
});
