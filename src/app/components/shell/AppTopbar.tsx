import type { ReactNode } from "react";
import { Menu, Search } from "lucide-react";
import { Button } from "@/app/components/ui/button";

interface AppTopbarProps {
  onMenuClick: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  right?: ReactNode;
}

export function AppTopbar({ onMenuClick, searchValue, onSearchChange, right }: AppTopbarProps) {
  return (
    <header className="sticky top-0 z-10 bg-background border-b border-separator px-4 lg:px-7 py-[18px] flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          aria-label="打开导航菜单"
          className="lg:hidden shrink-0 rounded-[10px]"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink truncate">健康概览</h1>
          <p className="hidden sm:block text-[12.5px] text-ink-3 truncate">智能记录，轻松管理您的健康数据</p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4 pointer-events-none" />
          <input
            type="text"
            value={searchValue}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="搜索记录、指标..."
            aria-label="搜索记录、指标"
            className="w-40 md:w-64 h-[42px] pl-9 pr-3 rounded-xl border border-separator bg-input-background text-sm text-ink placeholder:text-ink-4 outline-none transition-colors focus:border-brand focus:bg-white focus:ring-[3px] focus:ring-ring"
          />
        </div>
        {right}
      </div>
    </header>
  );
}
