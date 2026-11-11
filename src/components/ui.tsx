import {useLocale, type Locale} from "../i18n/locale.ts";
import {translate} from "../i18n/translate.ts";
import {hostType} from "../i18n/hostIdentity.ts";
import { Children, Fragment, cloneElement, isValidElement, type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from "react";
import { ChevronRight, Layers3, CircleCheck, Clock3, TriangleAlert, ChartNoAxesCombined } from "lucide-react";
import type { RiskLevel } from "../data/projects";

export function Card({
  children,
  className = "",
  ...props
}: {
  children: ReactNode;
  className?: string;
} & ComponentPropsWithoutRef<"section">) {
  return (
    <section {...props} className={`surface-card business-card rounded-xl border border-[#2b3139] bg-[#1e2329] text-[#eaecef] ${className}`}>
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading mb-5 flex flex-col gap-3 border-b border-[#2b3139] pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="page-heading-eyebrow">{eyebrow}</p> : null}
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#eaecef]">{title}</h1>
      </div>
      {action ? <div className="page-heading-actions flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "navy",
  onClick,
  featured=false,
}: {
  label: string;
  value: string;
  hint?: string;
  featured?:boolean;
  tone?: "navy" | "gold" | "red" | "green" | "orange";
  onClick?: () => void;
}) {
  const colors = {
    navy: "border-[#2b3139] bg-[#1e2329] text-gold",
    gold: "border-[#2b3139] bg-[#1e2329] text-gold",
    red: "border-[#2b3139] bg-[#1e2329] text-[#f6465d]",
    green: "border-[#2b3139] bg-[#1e2329] text-[#0ecb81]",
    orange: "border-[#2b3139] bg-[#1e2329] text-gold",
  };

  const numberWithUnit=value.match(/^([\d,.+-]+)\s*(万元|亿元|元|万|亿|笔|项|个|只|%)$/);
  const MetricIcon = {navy: Layers3, gold: ChartNoAxesCombined, red: TriangleAlert, green: CircleCheck, orange: Clock3}[tone];
  const content = (
    <>
      <div className="metric-label"><p>{label}</p><span className="metric-icon"><MetricIcon size={18}/></span></div>
      <div className="mt-3 flex items-end justify-between gap-3 border-t border-[#2b3139] pt-3">
        <p className="number-font text-3xl font-semibold leading-none">{numberWithUnit?<>{numberWithUnit[1]}<small className="metric-unit">{numberWithUnit[2]}</small></>:value}</p>
        {hint ? <span className="text-xs font-medium text-[#707a8a]">{hint}</span> : null}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-featured={featured} data-metric-tone={tone} className={`dashboard-entry surface-card metric-card reveal-up w-full rounded-xl border ${colors[tone]} p-4 text-left transition hover:border-gold focus:outline-none`}
      >
        {content}
      </button>
    );
  }

  return <Card data-featured={featured} data-metric-tone={tone} className={`metric-card border ${colors[tone]} p-4 reveal-up`}>{content}</Card>;
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "gold" | "green" | "orange" | "red" | "navy";
}) {
  const styles = {
    slate: "bg-[#2b3139] text-[#eaecef]",
    gold: "bg-[#3a3a1f] text-gold",
    green: "bg-[#102821] text-[#0ecb81]",
    orange: "bg-[#332600] text-[#f1c21b]",
    red: "bg-[#35171d] text-[#f6465d]",
    navy: "bg-[#2b3139] text-[#eaecef]",
  };

  return (
    <span data-status-tone={tone} className={`inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-xs font-semibold ${styles[tone]}`}>
      {children}
    </span>
  );
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  if (level === "高") return <Badge tone="red">高风险</Badge>;
  if (level === "中") return <Badge tone="orange">中风险</Badge>;
  return <Badge tone="green">低风险</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  let tone: "slate" | "gold" | "green" | "orange" | "red" = "gold";

  if (status.includes("否决") || status.includes("拒绝") || status.includes("失败") || status.includes("逾期") || status.includes("高")) {
    tone = "red";
  } else if (status.includes("已取消") || status.includes("已退出") || status.includes("草稿")) {
    tone = "slate";
  } else if (status.includes("退回") || status.includes("退出") || status.includes("待") || status.includes("生成")) {
    tone = "orange";
  } else if (status.includes("已") || status.includes("完成")) {
    tone = "green";
  }

  return <Badge tone={tone}>{status}</Badge>;
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  ariaLabel,
  creation,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?:boolean;
  ariaLabel?:string;
  creation?:boolean;
}) {
  return (
    <button data-ui="primary" data-action={creation?'create':undefined} aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className="ui-primary inline-flex h-10 items-center justify-center gap-2 rounded-md bg-gold px-4 text-sm font-semibold text-[#181a20] shadow-sm transition hover:bg-[#f0b90b]"
    >
      {children}
      <ChevronRight size={16} />
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?:boolean;
}) {
  return (
    <button data-ui="secondary"
      onClick={onClick}
      disabled={disabled}
      className="ui-secondary inline-flex h-10 items-center justify-center rounded-md border border-[#2b3139] bg-[#1e2329] px-4 text-sm font-semibold text-[#eaecef] transition hover:border-gold hover:text-gold"
    >
      {children}
    </button>
  );
}

export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  const locale = useLocale();
  const labelledChildren = addResponsiveTableLabels(children, headers, locale);

  return (
    <div className="responsive-table rounded-xl border border-[#2b3139] bg-[#1e2329]">
      <table className="w-full divide-y divide-[#2b3139] text-sm text-[#eaecef]">
        <thead className="bg-[#11161d] text-left text-xs font-semibold text-[#707a8a]">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3.5 align-top">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2b3139] bg-[#1e2329]">{labelledChildren}</tbody>
      </table>
    </div>
  );
}

function addResponsiveTableLabels(children: ReactNode, headers: string[], locale: Locale): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;

    if (child.type === Fragment) {
      const fragment = child as ReactElement<{ children?: ReactNode }>;
      return cloneElement(fragment, {
        children: addResponsiveTableLabels(fragment.props.children, headers, locale),
      });
    }

    if (hostType(child.type) !== "tr") return child;

    const row = child as ReactElement<{ children?: ReactNode; className?: string }>;
    const rowChildren = Children.map(row.props.children, (cell, index) => {
      if (!isValidElement(cell) || hostType(cell.type) !== "td") return cell;

      const tableCell = cell as ReactElement<{
        className?: string;
        colSpan?: number;
        "data-label"?: string;
        "data-display-label"?: string;
      }>;
      const className = `responsive-table-cell ${tableCell.props.className ?? ""}`.trim();

      const label = tableCell.props["data-label"] ?? headers[index] ?? "";
      return cloneElement(tableCell, {
        "data-label": label,
        "data-display-label": translate(label, locale),
        className,
      });
    });

    return cloneElement(row, {
      children: rowChildren,
      className: `responsive-table-row ${row.props.className ?? ""}`.trim(),
    });
  });
}

export function Timeline({
  items,
}: {
  items: Array<{ date: string; title: string; level?: RiskLevel; detail?: string }>;
}) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={`${item.date}-${item.title}`} className="relative flex gap-4">
          <div className="flex flex-col items-center">
            <span className="mt-1 h-3 w-3 rounded-full bg-gold ring-4 ring-gold/10" />
            {index < items.length - 1 ? <span className="h-full w-px bg-slate-200" /> : null}
          </div>
          <div className="pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="number-font text-xs font-semibold text-slate-500">{item.date}</p>
              {item.level ? <RiskBadge level={item.level} /> : null}
            </div>
            <p className="mt-1 font-medium text-slate-900">{item.title}</p>
            {item.detail ? <p className="mt-1 text-sm leading-6 text-slate-500">{item.detail}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
