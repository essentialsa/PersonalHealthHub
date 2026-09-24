/**
 * 导入去重工具：按 (date, indicatorType, value) 三元组识别与已有记录重复的候选项。
 * 结构化类型与 HealthRecord 兼容，避免服务层依赖组件模块。
 */
export interface DuplicateCheckRecord {
  date: string;
  indicatorType: string;
  value: number;
}

export const recordDuplicateKey = (record: DuplicateCheckRecord): string =>
  `${record.date}::${record.indicatorType}::${record.value}`;

/**
 * 找出 incoming 中与 existing 重复的记录（同日期 + 同指标类型 + 同数值）。
 * 仅比对既有记录，不处理 incoming 内部的互重（同一批次内重复由调用方按需处理）。
 */
export const findDuplicateRecords = <T extends DuplicateCheckRecord>(incoming: T[], existing: T[]): T[] => {
  const existingKeys = new Set(existing.map(recordDuplicateKey));
  return incoming.filter(record => existingKeys.has(recordDuplicateKey(record)));
};
