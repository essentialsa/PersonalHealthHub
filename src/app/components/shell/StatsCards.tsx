import { Calendar, Clock, Database, Layers, TrendingUp } from "lucide-react";

interface StatsCardsProps {
  records: { date: string }[];
  categoriesCount: number;
}

function formatDaysAgo(dateMs: number): string {
  const diffMs = Date.now() - dateMs;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    return "今天";
  }
  if (days === 1) {
    return "1 天前";
  }
  return `${days} 天前`;
}

export function StatsCards({ records, categoriesCount }: StatsCardsProps) {
  const total = records.length;
  const latestMs = records.length
    ? Math.max(...records.map(record => new Date(record.date).getTime()))
    : null;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const newThisMonth = records.filter(record => record.date.slice(0, 7) === currentMonth).length;

  const cards = [
    {
      key: "total",
      icon: <Database className="w-5 h-5" />,
      iconWrap: "bg-brand-soft text-brand",
      label: "总记录数",
      value: total,
      chip: (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full text-success bg-success-soft">
          <TrendingUp className="w-3.5 h-3.5" />
          {`+${newThisMonth} 本月新增`}
        </span>
      ),
    },
    {
      key: "kinds",
      icon: <Layers className="w-5 h-5" />,
      iconWrap: "bg-info-soft text-info",
      label: "检验指标种类",
      value: categoriesCount,
      chip: (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full text-info bg-info-soft">
          <Database className="w-3.5 h-3.5" />
          {`覆盖 ${categoriesCount} 大类别`}
        </span>
      ),
    },
    {
      key: "latest",
      icon: <Calendar className="w-5 h-5" />,
      iconWrap: "bg-success-soft text-success",
      label: "最后更新",
      value: latestMs ? new Date(latestMs).toLocaleDateString("zh-CN") : "暂无数据",
      chip: latestMs ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full text-brand bg-brand-soft">
          <Clock className="w-3.5 h-3.5" />
          {formatDaysAgo(latestMs)}
        </span>
      ) : null,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map(card => (
        <div
          key={card.key}
          className="bg-white border border-separator rounded-[18px] shadow-card px-5 py-[18px] flex flex-col gap-3"
        >
          <div className={`w-11 h-11 rounded-[13px] flex items-center justify-center ${card.iconWrap}`}>
            {card.icon}
          </div>
          <div className="text-[12.5px] text-ink-3">{card.label}</div>
          <div className="text-[34px] font-bold text-ink leading-none tracking-[-0.025em]">{card.value}</div>
          <div>{card.chip}</div>
        </div>
      ))}
    </div>
  );
}
