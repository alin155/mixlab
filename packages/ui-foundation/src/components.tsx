import type { ReactNode } from "react";

export interface SidebarItem {
  label: string;
  icon: string;
  href?: string;
}

export interface SidebarBrand {
  title: string;
  subtitle: string;
  mark?: string;
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
  selected?: boolean;
  onSelect?: () => void;
  select_label?: string;
}

export type StatusTone = "ready" | "processing" | "queued" | "warning" | "failed";

export interface FormGroup {
  title: string;
  rows: Array<{
    label: string;
    value: ReactNode;
  }>;
}

function iconSymbol(icon: string): ReactNode {
  const svgProps = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };
  const icons: Record<string, ReactNode> = {
    archive: (
      <svg {...svgProps}>
        <path d="M4 7h16" />
        <path d="M5 7l1 13h12l1-13" />
        <path d="M9 11h6" />
      </svg>
    ),
    database: (
      <svg {...svgProps}>
        <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
        <path d="M4.5 5.5v13c0 1.65 3.35 3 7.5 3s7.5-1.35 7.5-3v-13" />
        <path d="M4.5 12c0 1.65 3.35 3 7.5 3s7.5-1.35 7.5-3" />
      </svg>
    ),
    search: (
      <svg {...svgProps}>
        <circle cx="11" cy="11" r="7" />
        <path d="M16.5 16.5L21 21" />
      </svg>
    ),
    list: (
      <svg {...svgProps}>
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <path d="M3 6h.01" />
        <path d="M3 12h.01" />
        <path d="M3 18h.01" />
      </svg>
    ),
    folder: (
      <svg {...svgProps}>
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
      </svg>
    ),
    queue: (
      <svg {...svgProps}>
        <path d="M6 4v16" />
        <path d="M18 4v16" />
        <path d="M4 8h4" />
        <path d="M4 16h4" />
        <path d="M16 8h4" />
        <path d="M16 16h4" />
        <path d="M9 7h6" />
        <path d="M9 12h6" />
        <path d="M9 17h6" />
      </svg>
    ),
    sliders: (
      <svg {...svgProps}>
        <path d="M4 7h8" />
        <path d="M16 7h4" />
        <circle cx="14" cy="7" r="2" />
        <path d="M4 12h3" />
        <path d="M11 12h9" />
        <circle cx="9" cy="12" r="2" />
        <path d="M4 17h10" />
        <path d="M18 17h2" />
        <circle cx="16" cy="17" r="2" />
      </svg>
    ),
    settings: (
      <svg {...svgProps}>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.04.04a2.15 2.15 0 0 1-3.04 3.04l-.04-.04a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.08 1.65V22a2.15 2.15 0 0 1-4.3 0v-.07A1.8 1.8 0 0 0 8.3 20.3a1.8 1.8 0 0 0-2 .36l-.04.04a2.15 2.15 0 0 1-3.04-3.04l.04-.04a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 2 14.55v-.1a1.8 1.8 0 0 0 1.63-1.08 1.8 1.8 0 0 0-.36-2l-.04-.04a2.15 2.15 0 0 1 3.04-3.04l.04.04a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 9.37 7V6a2.15 2.15 0 0 1 4.3 0v1a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 2-.36l.04-.04a2.15 2.15 0 0 1 3.04 3.04l-.04.04a1.8 1.8 0 0 0-.36 2c.2.5.63.9 1.15 1.06" />
      </svg>
    ),
    users: (
      <svg {...svgProps}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    home: (
      <svg {...svgProps}>
        <path d="M3 11.5L12 4l9 7.5" />
        <path d="M5.5 10.5V20h13v-9.5" />
        <path d="M9.5 20v-6h5v6" />
      </svg>
    ),
    dashboard: (
      <svg {...svgProps}>
        <path d="M3 11.5L12 4l9 7.5" />
        <path d="M5.5 10.5V20h13v-9.5" />
        <path d="M9.5 20v-6h5v6" />
      </svg>
    ),
    video: (
      <svg {...svgProps}>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="M10 9l5 3-5 3z" />
      </svg>
    ),
    doctor: (
      <svg {...svgProps}>
        <path d="M20.5 11.5a8.5 8.5 0 1 1-3-6.5" />
        <path d="M8 12l2.5 2.5L20 5" />
      </svg>
    ),
    index: (
      <svg {...svgProps}>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </svg>
    )
  };

  return icons[icon] ?? (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
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
  brand,
  items,
  active,
  footer
}: {
  brand?: SidebarBrand;
  items: readonly SidebarItem[];
  active: string;
  footer?: ReactNode;
}) {
  const brandContent = brand ? (
    <>
      <span className="ml-sidebar-brand-mark" aria-hidden="true">
        {brand.mark ?? "ML"}
      </span>
      <span>
        <strong>{brand.title}</strong>
        <small>{brand.subtitle}</small>
      </span>
    </>
  ) : null;

  return (
    <nav className="ml-sidebar" aria-label="MixLab navigation">
      {brand ? (
        brand.href ? (
          <a className="ml-sidebar-brand" href={brand.href}>
            {brandContent}
          </a>
        ) : (
          <span className="ml-sidebar-brand">{brandContent}</span>
        )
      ) : null}
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

function GalleryCardContent({ item }: { item: GalleryItem }) {
  return (
    <>
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
    </>
  );
}

export function GalleryGrid({ items }: { items: readonly GalleryItem[] }) {
  return (
    <div className="ml-gallery-grid">
      {items.map((item) => (
        <article className={`ml-gallery-card${item.selected ? " is-selected" : ""}`} key={item.id}>
          {item.onSelect ? (
            <button
              className="ml-gallery-select"
              type="button"
              aria-label={item.select_label ?? item.title}
              aria-pressed={item.selected ? "true" : "false"}
              onClick={item.onSelect}
            >
              <GalleryCardContent item={item} />
            </button>
          ) : (
            <GalleryCardContent item={item} />
          )}
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
