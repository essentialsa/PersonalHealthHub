import type { ReactNode } from "react";
import { Activity } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/app/components/ui/sheet";

export interface SidebarGroup {
  title: string;
  items: ReactNode[];
}

export function SidebarLogo() {
  return (
    <div className="flex items-center gap-[11px] px-[18px] pt-5 pb-3.5 shrink-0">
      <div className="w-[38px] h-[38px] rounded-[10px] bg-[linear-gradient(135deg,#7c6ff0,#6c5ce7,#3b82f6)] shadow-[0_4px_10px_rgba(108,92,231,0.35)] flex items-center justify-center shrink-0">
        <Activity className="w-[21px] h-[21px] text-white" />
      </div>
      <span className="text-[15.5px] font-semibold tracking-[-0.01em] text-ink">个人健康中心</span>
    </div>
  );
}

export function SidebarNav({ groups }: { groups: SidebarGroup[] }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 pt-1.5 pb-3 space-y-[18px]">
      {groups.map(group => (
        <div key={group.title}>
          <div className="px-2.5 pb-[5px] text-[11.5px] font-semibold uppercase tracking-[0.01em] text-ink-3">
            {group.title}
          </div>
          <div className="space-y-px">
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
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-20 w-[260px] flex-col bg-sidebar border-r border-sidebar-border">
      <SidebarLogo />
      <SidebarNav groups={groups} />
      {footer && <div className="border-t border-sidebar-border px-3 pt-2.5 pb-3.5 shrink-0">{footer}</div>}
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
        className="w-[260px] p-0 bg-sidebar border-sidebar-border flex flex-col"
      >
        <SheetHeader className="p-0 border-b-0">
          <SheetTitle asChild>
            <div>
              <SidebarLogo />
            </div>
          </SheetTitle>
        </SheetHeader>
        <SidebarNav groups={groups} />
        {footer && <div className="border-t border-sidebar-border px-3 pt-2.5 pb-3.5 shrink-0">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
