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
    <div className="bg-white/70 backdrop-blur-xl border border-violet-100 rounded-2xl p-6 hover:shadow-xl hover:shadow-violet-100/50 hover:-translate-y-1 hover:border-violet-200 transition-all duration-300 flex flex-col gap-4">
      <div className="flex items-start gap-3.5">
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", iconWrap)}>
          {icon}
        </div>
        <div>
          <div className="text-[15px] font-semibold text-gray-800">{title}</div>
          <div className="text-[13px] text-gray-500 mt-1 leading-relaxed">{desc}</div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 flex-wrap">{footer}</div>
    </div>
  );
}

const cardBtnPrimary =
  "h-9 px-4 rounded-lg text-[13px] font-medium gap-1.5 border-0 bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 shadow-md shadow-violet-200/60";
const cardBtnSecondary =
  "h-9 px-4 rounded-lg text-[13px] font-medium gap-1.5 bg-white/80 border-violet-200 text-gray-700 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700";

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
      <div className="bg-white/60 backdrop-blur-xl border border-violet-100 rounded-2xl shadow-xl shadow-violet-100/40 overflow-hidden">
        <div className="px-6 py-5 border-b border-violet-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-800">数据维护</h3>
            <p className="text-[13px] text-gray-500 mt-0.5">管理检验指标和数据记录</p>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <LauncherCard
              icon={<SlidersHorizontal className="w-5 h-5" />}
              iconWrap="bg-violet-100 text-violet-600"
              title="检验指标维护"
              desc="添加、编辑、删除检验指标项目"
              footer={
                <>
                  <span className="text-xs text-gray-400">{`当前 ${indicatorCount} 个指标`}</span>
                  {slots.manageIndicators}
                </>
              }
            />
            <LauncherCard
              icon={<FileSpreadsheet className="w-5 h-5" />}
              iconWrap="bg-blue-100 text-blue-600"
              title="Excel 数据管理"
              desc="批量导入或导出检验数据"
              footer={
                <>
                  <span className="text-xs text-gray-400">支持 .xlsx, .csv</span>
                  <div className="flex gap-2">
                    {slots.importExcel}
                    {slots.exportExcel}
                  </div>
                </>
              }
            />
            <LauncherCard
              icon={<FilePlus className="w-5 h-5" />}
              iconWrap="bg-purple-100 text-purple-600"
              title="报告导入管理"
              desc="从体检报告中自动识别提取数据"
              footer={
                <>
                  <span className="text-xs text-gray-400">{`附件 ${reportCount} 份`}</span>
                  {slots.importReport}
                </>
              }
            />
            <LauncherCard
              icon={<Cloud className="w-5 h-5" />}
              iconWrap="bg-amber-100 text-amber-600"
              title="云端同步"
              desc="将数据同步到云端，多设备访问"
              footer={
                <>
                  {syncTone === "syncing" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      正在同步…
                    </span>
                  ) : syncTone === "success" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {syncText}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
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
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50/60 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[15px] font-semibold text-rose-600">危险操作</div>
                <div className="text-[13px] text-rose-500/90 mt-1">删除所有数据，此操作不可撤销</div>
              </div>
            </div>
            <div className="shrink-0">{slots.clearAll}</div>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}

export { cardBtnPrimary, cardBtnSecondary };
