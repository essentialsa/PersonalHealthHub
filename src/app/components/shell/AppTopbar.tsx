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
    <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-xl border-b border-violet-100 px-4 lg:px-8 py-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="outline"
          size="icon"
          onClick={onMenuClick}
          aria-label="打开导航菜单"
          className="lg:hidden shrink-0 bg-white/80 border-violet-200 text-violet-600 hover:bg-violet-50 hover:text-violet-700"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg lg:text-xl font-bold text-gray-800 truncate">数据概览</h1>
          <p className="hidden sm:block text-xs text-gray-500 truncate">智能记录，轻松管理您的健康数据</p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchValue}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="搜索记录、指标..."
            aria-label="搜索记录、指标"
            className="w-40 md:w-64 h-10 pl-9 pr-3 rounded-lg border border-violet-200 bg-white/60 text-sm text-gray-700 placeholder:text-gray-400 outline-none transition-colors focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
          />
        </div>
        {right}
      </div>
    </header>
  );
}
