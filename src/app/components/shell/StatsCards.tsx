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
      icon: <Database className="w-6 h-6" />,
      iconWrap: "bg-violet-100 text-violet-600",
      label: "总记录数",
      value: total,
      chip: (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full text-emerald-600 bg-emerald-50 border border-emerald-100">
          <TrendingUp className="w-3.5 h-3.5" />
          {`+${newThisMonth} 本月新增`}
        </span>
      ),
    },
    {
      key: "kinds",
      icon: <Layers className="w-6 h-6" />,
      iconWrap: "bg-blue-100 text-blue-600",
      label: "检验指标种类",
      value: categoriesCount,
      chip: (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full text-blue-600 bg-blue-50 border border-blue-100">
          <Database className="w-3.5 h-3.5" />
          {`覆盖 ${categoriesCount} 大类别`}
        </span>
      ),
    },
    {
      key: "latest",
      icon: <Calendar className="w-6 h-6" />,
      iconWrap: "bg-pink-100 text-rose-500",
      label: "最后更新",
      value: latestMs ? new Date(latestMs).toLocaleDateString("zh-CN") : "暂无数据",
      chip: latestMs ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full text-blue-600 bg-blue-50 border border-blue-100">
          <Clock className="w-3.5 h-3.5" />
          {formatDaysAgo(latestMs)}
        </span>
      ) : null,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {cards.map(card => (
        <div
          key={card.key}
          className="bg-white/60 backdrop-blur-xl border border-violet-100/70 rounded-2xl p-6 shadow-xl shadow-violet-100/40 hover:shadow-2xl hover:shadow-violet-100/60 hover:-translate-y-0.5 transition-all duration-300 flex flex-col gap-3"
        >
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card.iconWrap}`}>
            {card.icon}
          </div>
          <div className="text-sm text-gray-500">{card.label}</div>
          <div className="text-3xl font-bold text-gray-800 leading-tight">{card.value}</div>
          <div>{card.chip}</div>
        </div>
      ))}
    </div>
  );
}
