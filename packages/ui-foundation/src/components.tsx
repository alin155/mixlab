import type { ReactNode } from "react";

export interface SidebarItem {
  label: string;
  icon: string;
  href?: string;
}

export interface ToolbarProps {
  title: string;
  libraryLabel?: string;
  availableCountLabel?: string;
  healthLabel?: string;
  actions?: readonly string[];
}

export interface GalleryItem {
  id: string;
  title: string;
  image: string;
  meta: string;
  tags?: readonly string[];
  description?: string;
  href?: string;
  action_label?: string;
}

export type StatusTone = "ready" | "processing" | "queued" | "warning" | "failed";

export interface FormGroup {
  title: string;
  rows: Array<{
    label: string;
    value: ReactNode;
  }>;
}

function iconSymbol(icon: string): string {
  const symbols: Record<string, string> = {
    archive: "□",
    search: "⌕",
    list: "≡",
    folder: "▣",
    queue: "○",
    settings: "⌘",
    dashboard: "⌂",
    video: "▤",
    doctor: "◎",
    index: "◇"
  };

  return symbols[icon] ?? "•";
}

export function MacWindow({
  title,
  meta,
  children,
  className = ""
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ml-window ${className}`.trim()}>
      <header className="ml-window-chrome">
        <span className="ml-traffic-lights" aria-hidden="true">
          <span className="ml-traffic-light is-close" />
          <span className="ml-traffic-light is-minimize" />
          <span className="ml-traffic-light is-zoom" />
        </span>
        <span className="ml-window-title">{title}</span>
        {meta ? <span className="ml-window-meta">{meta}</span> : null}
      </header>
      {children}
    </section>
  );
}

export function Sidebar({
  items,
  active,
  footer
}: {
  items: readonly SidebarItem[];
  active: string;
  footer?: ReactNode;
}) {
  return (
    <nav className="ml-sidebar" aria-label="MixLab navigation">
      {items.map((item) => (
        <a
          className={`ml-sidebar-item${item.label === active ? " is-active" : ""}`}
          href={item.href}
          key={item.label}
        >
          <span className="ml-sidebar-icon" aria-hidden="true">
            {iconSymbol(item.icon)}
          </span>
          <span>{item.label}</span>
        </a>
      ))}
      {footer ? <div className="ml-sidebar-footer">{footer}</div> : null}
    </nav>
  );
}

export function UnifiedToolbar({
  title,
  libraryLabel = "默认公共库",
  availableCountLabel,
  healthLabel = "健康",
  actions = []
}: ToolbarProps) {
  return (
    <header className="ml-toolbar">
      <strong className="ml-toolbar-title">{title}</strong>
      <span className="ml-toolbar-controls">
        <span className="ml-select">{libraryLabel}</span>
        {actions.map((action) => (
          <button className="ml-button" type="button" key={action}>
            {action}
          </button>
        ))}
      </span>
      <span className="ml-toolbar-controls">
        {availableCountLabel ? <span className="ml-window-meta">{availableCountLabel}</span> : null}
        <span className="ml-health">{healthLabel}</span>
      </span>
    </header>
  );
}

export function SegmentedControl({
  options,
  active
}: {
  options: readonly string[];
  active: string;
}) {
  return (
    <span className="ml-segmented">
      {options.map((option) => (
        <button
          className={`ml-segmented-item${option === active ? " is-active" : ""}`}
          type="button"
          key={option}
        >
          {option}
        </button>
      ))}
    </span>
  );
}

export function GalleryGrid({ items }: { items: readonly GalleryItem[] }) {
  return (
    <div className="ml-gallery-grid">
      {items.map((item) => (
        <article className="ml-gallery-card" key={item.id}>
          <img src={item.image} alt="" loading="lazy" />
          <div className="ml-gallery-card-body">
            <strong className="ml-gallery-title">{item.title}</strong>
            <span className="ml-gallery-meta">{item.meta}</span>
            {item.tags?.length ? (
              <span className="ml-tag-row">
                {item.tags.map((tag) => (
                  <span className="ml-tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </span>
            ) : null}
            {item.description ? (
              <span className="ml-gallery-description">{item.description}</span>
            ) : null}
            {item.href ? (
              <a className="ml-gallery-action" href={item.href}>
                {item.action_label ?? "查看详情"}
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export function SourceTable({
  columns,
  rows
}: {
  columns: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <table className="ml-source-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InspectorPanel({
  title,
  action,
  children
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside className="ml-inspector">
      <header className="ml-inspector-header">
        <h2 className="ml-inspector-title">{title}</h2>
        {action}
      </header>
      <div className="ml-inspector-body">{children}</div>
    </aside>
  );
}

export function GroupedForm({ groups }: { groups: readonly FormGroup[] }) {
  return (
    <div className="ml-grouped-form">
      {groups.map((group) => (
        <section className="ml-form-group" key={group.title}>
          <h2 className="ml-form-group-title">{group.title}</h2>
          {group.rows.map((row) => (
            <div className="ml-form-row" key={row.label}>
              <span className="ml-form-label">{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function StatusRow({
  tone,
  label,
  detail,
  value
}: {
  tone: StatusTone;
  label: string;
  detail: string;
  value?: ReactNode;
}) {
  return (
    <div className={`ml-status-row is-${tone}`}>
      <span className="ml-status-dot" aria-hidden="true" />
      <strong>{label}</strong>
      <span>{detail}</span>
      {value ? <span>{value}</span> : null}
    </div>
  );
}

export function MediaPanel({
  title,
  image,
  children
}: {
  title: string;
  image: string;
  children?: ReactNode;
}) {
  return (
    <section className="ml-media-panel">
      <header className="ml-panel-header">
        <h2 className="ml-panel-title">{title}</h2>
      </header>
      <img src={image} alt="" />
      {children ? <div className="ml-media-body">{children}</div> : null}
    </section>
  );
}

export function PageBoard({ children }: { children: ReactNode }) {
  return <main className="ml-page-board">{children}</main>;
}
