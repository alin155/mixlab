import type { CSSProperties, ReactNode } from "react";
import type { Tone } from "../domain/fixtures";

type ButtonTone = "primary" | "secondary" | "ghost" | "danger";

export interface NavItem {
  key: string;
  label: string;
  icon: string;
  href: string;
}

export interface ShellStat {
  label: string;
  value: string;
  tone?: Tone;
}

export function AppShell({
  title,
  subtitle,
  navItems,
  activeKey,
  stats,
  user,
  variant = "web",
  children
}: {
  title: string;
  subtitle: string;
  navItems: NavItem[];
  activeKey: string;
  stats: ShellStat[];
  user: { name: string; meta: string };
  variant?: "web" | "desktop";
  children: ReactNode;
}) {
  return (
    <div className={`mf-page mf-page-${variant}`}>
      <section className="mf-shell">
        <Sidebar title={title} subtitle={subtitle} items={navItems} activeKey={activeKey} stats={stats} user={user} />
        <main className="mf-workspace">{children}</main>
      </section>
    </div>
  );
}

export function Sidebar({
  title,
  subtitle,
  items,
  activeKey,
  stats,
  user
}: {
  title: string;
  subtitle: string;
  items: NavItem[];
  activeKey: string;
  stats: ShellStat[];
  user: { name: string; meta: string };
}) {
  return (
    <nav className="mf-sidebar" aria-label={`${title} navigation`}>
      <a className="mf-brand" href="#/comparison">
        <span className="mf-logo">ML</span>
        <span>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
      </a>
      <div className="mf-nav-list">
        {items.map((item) => (
          <a key={item.key} className={`mf-nav-item ${item.key === activeKey ? "is-active" : ""}`} href={item.href}>
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </a>
        ))}
      </div>
      <div className="mf-sidebar-footer">
        <div className="mf-side-status">
          {stats.map((stat) => (
            <div key={stat.label} className="mf-side-stat">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>
        <div className="mf-side-user">
          <span className="mf-avatar">{user.name.slice(0, 1)}</span>
          <strong>{user.name}</strong>
          <small>{user.meta}</small>
        </div>
      </div>
    </nav>
  );
}

export function WorkbenchCard({
  children,
  className = "",
  padded = true
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <section className={`mf-card ${padded ? "is-padded" : ""} ${className}`}>{children}</section>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mf-page-header">
      <div>
        {eyebrow ? <span className="mf-eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="mf-page-actions">{actions}</div> : null}
    </header>
  );
}

export function Button({
  children,
  tone = "secondary",
  type = "button",
  disabled = false,
  className = ""
}: {
  children: ReactNode;
  tone?: ButtonTone;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button className={`mf-button mf-button-${tone} ${className}`} type={type} disabled={disabled}>
      {children}
    </button>
  );
}

export function IconButton({
  label,
  icon,
  href
}: {
  label: string;
  icon: string;
  href?: string;
}) {
  const content = (
    <>
      <span aria-hidden="true">{icon}</span>
      <span className="mf-sr-only">{label}</span>
    </>
  );
  return href ? (
    <a className="mf-icon-button" href={href} aria-label={label} title={label}>
      {content}
    </a>
  ) : (
    <button className="mf-icon-button" type="button" aria-label={label} title={label}>
      {content}
    </button>
  );
}

export function Input({
  value,
  placeholder,
  label
}: {
  value?: string;
  placeholder?: string;
  label?: string;
}) {
  return (
    <label className="mf-input-label">
      {label ? <span>{label}</span> : null}
      <input className="mf-input" value={value || ""} placeholder={placeholder} readOnly />
    </label>
  );
}

export function SearchBox({
  placeholder,
  value,
  compact = false
}: {
  placeholder: string;
  value?: string;
  compact?: boolean;
}) {
  return (
    <form className={`mf-search ${compact ? "is-compact" : ""}`}>
      <input aria-label="搜索" value={value || ""} placeholder={placeholder} readOnly />
      <Button tone="primary">搜索</Button>
    </form>
  );
}

export function Tabs({
  items,
  activeKey
}: {
  activeKey: string;
  items: Array<{ key: string; label: string; href: string; count?: number }>;
}) {
  return (
    <div className="mf-tabs" role="tablist">
      {items.map((item) => (
        <a key={item.key} className={`mf-tab ${item.key === activeKey ? "is-active" : ""}`} href={item.href} role="tab">
          <span>{item.label}</span>
          {typeof item.count === "number" ? <strong>{item.count}</strong> : null}
        </a>
      ))}
    </div>
  );
}

export function Dialog({ title, children, actions }: { title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <section className="mf-dialog">
      <h3>{title}</h3>
      <div>{children}</div>
      <footer>{actions}</footer>
    </section>
  );
}

export function Popover({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="mf-popover">
      <button type="button">{label}</button>
      <span className="mf-popover-panel">{children}</span>
    </span>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="mf-tooltip" data-tip={label}>
      {children}
    </span>
  );
}

export function StatusBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`mf-badge mf-badge-${tone}`}>{children}</span>;
}

export function DataTable<T>({
  columns,
  rows,
  getKey,
  selectedKey,
  className = ""
}: {
  columns: Array<{ key: string; title: string; render: (row: T) => ReactNode; align?: "left" | "center" | "right"; width?: string }>;
  rows: T[];
  getKey: (row: T) => string;
  selectedKey?: string;
  className?: string;
}) {
  return (
    <div className={`mf-table ${className}`}>
      <div className="mf-table-head">
        {columns.map((column) => (
          <div key={column.key} style={{ width: column.width, textAlign: column.align || "left" }}>
            {column.title}
          </div>
        ))}
      </div>
      <div className="mf-table-body">
        {rows.map((row) => {
          const key = getKey(row);
          return (
            <div key={key} className={`mf-table-row ${selectedKey === key ? "is-selected" : ""}`}>
              {columns.map((column) => (
                <div key={column.key} style={{ width: column.width, textAlign: column.align || "left" }}>
                  {column.render(row)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MediaCard({
  title,
  meta,
  image,
  selected = false,
  actions,
  compact = false
}: {
  title: string;
  meta: string;
  image: string;
  selected?: boolean;
  actions?: ReactNode;
  compact?: boolean;
}) {
  const imageStyle = { backgroundImage: image } as CSSProperties;
  return (
    <article className={`mf-media-card ${selected ? "is-selected" : ""} ${compact ? "is-compact" : ""}`}>
      <div className="mf-media-cover" style={imageStyle} />
      <div className="mf-media-body">
        <strong>{title}</strong>
        <span>{meta}</span>
        {actions ? <div className="mf-media-actions">{actions}</div> : null}
      </div>
    </article>
  );
}

export function InspectorPanel({ title, meta, children, actions }: { title: string; meta?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <aside className="mf-inspector">
      <header>
        <div>
          <h2>{title}</h2>
          {meta ? <span>{meta}</span> : null}
        </div>
        {actions ? <div className="mf-inspector-actions">{actions}</div> : null}
      </header>
      <div className="mf-inspector-body">{children}</div>
    </aside>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="mf-empty">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="mf-loading" aria-live="polite">
      <span />
      <strong>{label}</strong>
    </div>
  );
}

export function TranscriptPanel({
  lines,
  selectedRange
}: {
  lines: Array<{ time: string; text: string; hit?: boolean }>;
  selectedRange?: [number, number];
}) {
  return (
    <div className="mf-transcript">
      {lines.map((line, index) => {
        const selected = selectedRange && index >= selectedRange[0] && index <= selectedRange[1];
        return (
          <span key={`${line.time}-${index}`} className={`mf-transcript-row ${selected ? "is-selected" : ""}`}>
            <button className={`mf-time ${selectedRange?.[0] === index ? "is-anchor" : ""}`} type="button">
              {line.time}
            </button>
            <span className="mf-transcript-text">{line.hit ? highlightFirst(line.text) : line.text}</span>
          </span>
        );
      })}
    </div>
  );
}

function highlightFirst(text: string) {
  const token = text.includes("第一场") ? "第一场" : "现金流";
  if (!text.includes(token)) return text;
  const [before, after] = text.split(token);
  return (
    <>
      {before}
      <mark>{token}</mark>
      {after}
    </>
  );
}

export function FloatingCutAction({ label, duration }: { label: string; duration: string }) {
  return (
    <div className="mf-floating-cut">
      <span>{duration}</span>
      <Button tone="primary">{label}</Button>
    </div>
  );
}

export function FieldList({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="mf-field-list">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MetricGrid({ metrics }: { metrics: Array<{ label: string; value: string; tone?: Tone }> }) {
  return (
    <div className="mf-metrics">
      {metrics.map((metric) => (
        <WorkbenchCard key={metric.label} className="mf-metric">
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          {metric.tone ? <StatusBadge tone={metric.tone}>状态</StatusBadge> : null}
        </WorkbenchCard>
      ))}
    </div>
  );
}
