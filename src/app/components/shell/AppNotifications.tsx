import { Bell, Cloud, Loader2, RotateCcw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/components/ui/utils";

/** 结构化最小类型，避免与 App.tsx 产生循环依赖 */
export interface NotificationLogItem {
  id: string;
  timestamp: string;
  type: "create" | "update" | "delete" | "clear";
  before: { date: string; value: number; unit: string; indicatorType: string } | null;
  after: { date: string; value: number; unit: string; indicatorType: string } | null;
}

interface AppNotificationsProps {
  logs: NotificationLogItem[];
  indicatorLabels: Record<string, string>;
  syncing: boolean;
  syncText: string;
  onViewAll: () => void;
}

const ACTION_META: Record<NotificationLogItem["type"], { label: string; tone: string }> = {
  create: { label: "新增", tone: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  update: { label: "修改", tone: "text-blue-600 bg-blue-50 border-blue-100" },
  delete: { label: "删除", tone: "text-rose-600 bg-rose-50 border-rose-100" },
  clear: { label: "清空", tone: "text-amber-600 bg-amber-50 border-amber-100" },
};

function describeChange(log: NotificationLogItem, indicatorLabels: Record<string, string>): string {
  const typeId = log.after?.indicatorType ?? log.before?.indicatorType ?? "";
  const label = (indicatorLabels[typeId] ?? typeId) || "-";
  if (log.type === "clear") {
    return "清空所有体检记录";
  }
  if (log.type === "update" && log.before && log.after) {
    return `${label}：${log.before.value}${log.before.unit} → ${log.after.value}${log.after.unit}`;
  }
  if (log.type === "create" && log.after) {
    return `新增 ${label} ${log.after.value}${log.after.unit}`;
  }
  if (log.type === "delete" && log.before) {
    return `删除 ${label} ${log.before.value}${log.before.unit}`;
  }
  return label;
}

export function AppNotifications({ logs, indicatorLabels, syncing, syncText, onViewAll }: AppNotificationsProps) {
  const recentLogs = logs.slice(-10).reverse();
  const hasUnread = logs.length > 0 || syncing;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="通知"
          className="relative h-10 w-10 rounded-lg bg-white/60 border-violet-200 text-gray-500 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-300"
        >
          <Bell className="w-5 h-5" />
          {hasUnread && (
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 border-2 border-white" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 bg-white/95 backdrop-blur-xl border-violet-100 shadow-2xl rounded-xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-violet-100 bg-violet-50/50">
          <div className="text-sm font-semibold text-gray-800">通知中心</div>
          <div className="text-xs text-gray-500 mt-0.5">最近的变更记录与同步状态</div>
        </div>

        <div className="px-4 py-3 border-b border-violet-100 flex items-center gap-2 text-xs text-gray-600">
          {syncing ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          ) : (
            <Cloud className="w-4 h-4 text-violet-500" />
          )}
          <span>{syncText}</span>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {recentLogs.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-gray-400">
              <Bell className="w-6 h-6" />
              <span className="text-sm">暂无变更记录</span>
            </div>
          ) : (
            <ul className="divide-y divide-violet-50">
              {recentLogs.map(log => {
                const meta = ACTION_META[log.type];
                return (
                  <li key={log.id} className="px-4 py-2.5 flex items-start gap-2.5 hover:bg-violet-50/40">
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 px-2 py-0.5 rounded-full border text-[11px]",
                        meta.tone,
                      )}
                    >
                      {meta.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-gray-700 truncate">{describeChange(log, indicatorLabels)}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {new Date(log.timestamp).toLocaleString("zh-CN")}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="p-3 border-t border-violet-100">
          <Button
            variant="outline"
            size="sm"
            onClick={onViewAll}
            className="w-full h-8 text-xs border-violet-200 text-violet-600 hover:bg-violet-50"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            查看全部变更
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
