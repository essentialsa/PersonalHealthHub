import type { ReactNode } from "react";
import { Activity } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/app/components/ui/sheet";

export interface SidebarGroup {
  title: string;
  items: ReactNode[];
}

export function SidebarLogo() {
  return (
    <div className="flex items-center gap-3 px-5 py-5 border-b border-violet-100 shrink-0">
      <div className="p-2.5 bg-gradient-to-br from-violet-500 to-blue-500 rounded-xl shadow-lg shadow-violet-200">
        <Activity className="w-5 h-5 text-white" />
      </div>
      <span className="text-base font-bold text-gray-800">个人健康中心</span>
    </div>
  );
}

export function SidebarNav({ groups }: { groups: SidebarGroup[] }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      {groups.map(group => (
        <div key={group.title}>
          <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {group.title}
          </div>
          <div className="space-y-1">
            {group.items.map((item, index) => (
              <div key={`${group.title}-${index}`}>{item}</div>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

interface AppSidebarProps {
  groups: SidebarGroup[];
  footer?: ReactNode;
}

export function AppSidebar({ groups, footer }: AppSidebarProps) {
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-20 w-[260px] flex-col bg-white/80 backdrop-blur-xl border-r border-violet-100">
      <SidebarLogo />
      <SidebarNav groups={groups} />
      {footer && <div className="border-t border-violet-100 p-4 shrink-0">{footer}</div>}
    </aside>
  );
}

interface MobileSidebarSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: SidebarGroup[];
  footer?: ReactNode;
}

export function MobileSidebarSheet({ open, onOpenChange, groups, footer }: MobileSidebarSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[260px] p-0 bg-white/95 backdrop-blur-xl border-violet-100 flex flex-col [&>button]:text-violet-400"
      >
        <SheetHeader className="p-0 border-b-0">
          <SheetTitle asChild>
            <div>
              <SidebarLogo />
            </div>
          </SheetTitle>
        </SheetHeader>
        <SidebarNav groups={groups} />
        {footer && <div className="border-t border-violet-100 p-4 shrink-0">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
