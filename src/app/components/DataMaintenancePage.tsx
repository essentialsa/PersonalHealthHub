import type { ReactNode } from "react";
import {
  AlertTriangle,
  Cloud,
  FileSpreadsheet,
  FilePlus,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/components/ui/utils";

export type SyncBadgeTone = "success" | "syncing" | "muted";

interface DataMaintenancePageProps {
  indicatorCount: number;
  reportCount: number;
  syncTone: SyncBadgeTone;
  syncText: string;
  manualSyncing: boolean;
  onManualSync: () => void;
  /** 各弹窗触发器（由 App 传入已接线的 Dialog 组件节点） */
  slots: {
    manageIndicators: ReactNode;
    importExcel: ReactNode;
    exportExcel: ReactNode;
    importReport: ReactNode;
    clearAll: ReactNode;
  };
  /** 启动卡下方保留的内容：记录表格 + 变更记录 */
  children: ReactNode;
}

function LauncherCard({
  icon,
  iconWrap,
  title,
  desc,
  footer,
}: {
  icon: ReactNode;
  iconWrap: string;
  title: string;
  desc: string;
  footer: ReactNode;
}) {
  return (
    <div className="bg-white border border-[rgba(32,27,72,0.09)] rounded-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-3.5">
      <div className="flex items-start gap-3.5">
        <div className={cn("w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0", iconWrap)}>
          {icon}
        </div>
        <div>
          <div className="text-[15px] font-semibold text-[#20203a]">{title}</div>
          <div className="text-[12.5px] text-[#9a9ab0] mt-1 leading-relaxed">{desc}</div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 flex-wrap">{footer}</div>
    </div>
  );
}

const cardBtnPrimary =
  "h-9 px-4 rounded-full text-[13px] font-medium gap-1.5 border-0 bg-gradient-to-r from-[#7b6cf6] via-[#6c5ce7] to-[#2f7ff6] text-white shadow-[0_10px_24px_-8px_rgba(99,102,241,0.55)] hover:brightness-[1.06]";
const cardBtnSecondary =
  "h-9 px-4 rounded-full text-[13px] font-medium gap-1.5 bg-white border border-[rgba(32,27,72,0.12)] text-[#5a5a75] hover:bg-[#f4f2fe] hover:text-[#5a49d6] hover:border-[#cfc2f8]";

export function DataMaintenancePage({
  indicatorCount,
  reportCount,
  syncTone,
  syncText,
  manualSyncing,
  onManualSync,
  slots,
  children,
}: DataMaintenancePageProps) {
  return (
    <div className="space-y-6">
      {/* 启动卡片网格 */}
      <div className="bg-white border border-[rgba(32,27,72,0.09)] rounded-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-6 py-5 border-b border-[rgba(32,27,72,0.09)] flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#20203a]">数据维护</h3>
            <p className="text-[13px] text-[#9a9ab0] mt-0.5">管理检验指标和数据记录</p>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LauncherCard
              icon={<SlidersHorizontal className="w-5 h-5" />}
              iconWrap="bg-[#efedfd] text-[#6c5ce7]"
              title="检验指标维护"
              desc="添加、编辑、删除检验指标项目"
              footer={
                <>
                  <span className="text-[12px] text-[#9a9ab0]">{`当前 ${indicatorCount} 个指标`}</span>
                  {slots.manageIndicators}
                </>
              }
            />
            <LauncherCard
              icon={<FileSpreadsheet className="w-5 h-5" />}
              iconWrap="bg-[#ebf2fe] text-[#3b82f6]"
              title="Excel 数据管理"
              desc="批量导入或导出检验数据"
              footer={
                <>
                  <span className="text-[12px] text-[#9a9ab0]">支持 .xlsx, .csv</span>
                  <div className="flex gap-2">
                    {slots.importExcel}
                    {slots.exportExcel}
                  </div>
                </>
              }
            />
            <LauncherCard
              icon={<FilePlus className="w-5 h-5" />}
              iconWrap="bg-[#e8f7f1] text-[#0f9d6e]"
              title="报告导入管理"
              desc="从体检报告中自动识别提取数据"
              footer={
                <>
                  <span className="text-[12px] text-[#9a9ab0]">{`附件 ${reportCount} 份`}</span>
                  {slots.importReport}
                </>
              }
            />
            <LauncherCard
              icon={<Cloud className="w-5 h-5" />}
              iconWrap="bg-[#fdf3e3] text-[#d97706]"
              title="云端同步"
              desc="将数据同步到云端，多设备访问"
              footer={
                <>
                  {syncTone === "syncing" ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#2563eb] bg-[#ebf2fe] border border-[#cfe2fd] px-2.5 py-1 rounded-full">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      正在同步…
                    </span>
                  ) : syncTone === "success" ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#1a9947] bg-[#e8f7f1] border border-[#cdeee1] px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1a9947]" />
                      {syncText}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5a5a75] bg-[#f1f1f7] border border-[rgba(32,27,72,0.09)] px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#9a9ab0]" />
                      {syncText}
                    </span>
                  )}
                  <Button
                    variant="outline"
                    disabled={manualSyncing}
                    onClick={onManualSync}
                    className={cardBtnPrimary}
                  >
                    {manualSyncing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        同步中
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        立即同步
                      </>
                    )}
                  </Button>
                </>
              }
            />
          </div>

          {/* 危险区 */}
          <div className="mt-6 rounded-[14px] border border-[rgba(240,71,106,0.35)] bg-[#fdeef2]/45 overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-[rgba(240,71,106,0.15)]">
              <div className="w-8 h-8 rounded-[10px] bg-white text-[#f0476a] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="text-[15px] font-bold text-[#f0476a]">危险操作</div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-5 py-4">
              <div className="text-[13px] text-[#f0476a]/80 leading-relaxed">删除所有数据，此操作不可撤销</div>
              <div className="shrink-0">{slots.clearAll}</div>
            </div>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}

export { cardBtnPrimary, cardBtnSecondary };
