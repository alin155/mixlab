import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  CSSProperties,
  FormEvent,
  InputHTMLAttributes,
  MouseEventHandler,
  ReactNode
} from "react";

export const MIXLAB_UI_FOUNDATION_V1_COMPONENTS = [
  "tokens",
  "AppShell",
  "Sidebar",
  "Button",
  "SearchBox",
  "Card",
  "Table",
  "Badge",
  "InspectorPanel"
] as const;

export type MixlabUiFoundationV1Component =
  (typeof MIXLAB_UI_FOUNDATION_V1_COMPONENTS)[number];

export type BadgeTone =
  | "neutral"
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "cancelled"
  | "ready"
  | "processing"
  | "queued";

export type StatusTone =
  | "ready"
  | "processing"
  | "queued"
  | "warning"
  | "failed"
  | "pending"
  | "running"
  | "done"
  | "cancelled";

export interface SidebarItem {
  key?: string;
  label: string;
  icon?: string | ReactNode;
  href?: string;
  badge?: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  onClick?: MouseEventHandler<HTMLElement>;
}

export interface SidebarBrand {
  title: string;
  subtitle: string;
  mark?: string | ReactNode;
  href?: string;
}

export interface SidebarProps {
  brand?: SidebarBrand;
  items: readonly SidebarItem[];
  active?: string;
  activeKey?: string;
  footer?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

export interface AppShellProps {
  brand?: SidebarBrand;
  items: readonly SidebarItem[];
  active?: string;
  activeKey?: string;
  sidebarFooter?: ReactNode;
  children: ReactNode;
  className?: string;
  workbenchClassName?: string;
  ariaLabel?: string;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  href?: AnchorHTMLAttributes<HTMLAnchorElement>["href"];
  target?: AnchorHTMLAttributes<HTMLAnchorElement>["target"];
  rel?: AnchorHTMLAttributes<HTMLAnchorElement>["rel"];
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export interface SearchBoxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "onSubmit"> {
  buttonLabel?: string;
  hideButton?: boolean;
  inputClassName?: string;
  onSubmit?: (value: string) => void;
  onValueChange?: (value: string) => void;
}

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  selected?: boolean;
  bodyFlush?: boolean;
  className?: string;
  bodyClassName?: string;
}

export interface TableColumn<Row> {
  id: string;
  header: ReactNode;
  accessor?: keyof Row;
  render?: (row: Row, index: number) => ReactNode;
  align?: "left" | "center" | "right";
  width?: CSSProperties["width"];
  className?: string;
  headerClassName?: string;
}

export interface TableProps<Row> {
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  getRowKey?: (row: Row, index: number) => string | number;
  onRowClick?: (row: Row, index: number) => void;
  selectedRowKey?: string | number;
  empty?: ReactNode;
  stickyHeader?: boolean;
  density?: "compact" | "normal";
  className?: string;
}

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export interface InspectorPanelProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
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

function renderIcon(icon: string | ReactNode | undefined): ReactNode {
  if (!icon) {
    return null;
  }

  return typeof icon === "string" ? iconSymbol(icon) : icon;
}

function badgeToneClass(tone: BadgeTone): string {
  const aliases: Record<string, BadgeTone> = {
    ready: "success",
    done: "success",
    processing: "info",
    running: "info",
    queued: "neutral",
    pending: "warning",
    failed: "danger",
    cancelled: "neutral"
  };

  return `is-${aliases[tone] ?? tone}`;
}

export function AppShell({
  brand,
  items,
  active,
  activeKey,
  sidebarFooter,
  children,
  className = "",
  workbenchClassName = "",
  ariaLabel
}: AppShellProps) {
  return (
    <section className={cx("ml-app-shell", className)}>
      <Sidebar
        brand={brand}
        items={items}
        active={active}
        activeKey={activeKey}
        footer={sidebarFooter}
        ariaLabel={ariaLabel}
      />
      <main className={cx("ml-workbench", workbenchClassName)}>{children}</main>
    </section>
  );
}

export function Sidebar({
  brand,
  items,
  active,
  activeKey,
  footer,
  className = "",
  ariaLabel = "MixLab navigation"
}: SidebarProps) {
  const brandContent = brand ? (
    <>
      <span className="ml-sidebar-brand-mark" aria-hidden="true">
        {brand.mark ?? "ML"}
      </span>
      <span className="ml-sidebar-brand-copy">
        <strong>{brand.title}</strong>
        <small>{brand.subtitle}</small>
      </span>
    </>
  ) : null;

  return (
    <nav className={cx("ml-sidebar", className)} aria-label={ariaLabel}>
      {brand ? (
        brand.href ? (
          <a className="ml-sidebar-brand" href={brand.href}>
            {brandContent}
          </a>
        ) : (
          <span className="ml-sidebar-brand">{brandContent}</span>
        )
      ) : null}
      <div className="ml-sidebar-nav">
        {items.map((item) => {
          const itemKey = item.key ?? item.label;
          const isActive = activeKey
            ? itemKey === activeKey
            : active
              ? itemKey === active || item.label === active
              : false;
          const content = (
            <>
              {item.icon ? (
                <span className="ml-sidebar-icon" aria-hidden="true">
                  {renderIcon(item.icon)}
                </span>
              ) : null}
              <span className="ml-sidebar-item-label">{item.label}</span>
              {item.badge ? <span className="ml-sidebar-item-badge">{item.badge}</span> : null}
            </>
          );
          const classNameForItem = cx("ml-sidebar-item", isActive && "is-active");

          return item.href ? (
            <a
              aria-current={isActive ? "page" : undefined}
              aria-disabled={item.disabled ? "true" : undefined}
              aria-label={item.ariaLabel}
              className={classNameForItem}
              href={item.disabled ? undefined : item.href}
              key={itemKey}
              onClick={item.onClick as MouseEventHandler<HTMLAnchorElement> | undefined}
            >
              {content}
            </a>
          ) : (
            <button
              aria-pressed={isActive ? "true" : undefined}
              aria-label={item.ariaLabel}
              className={classNameForItem}
              disabled={item.disabled}
              key={itemKey}
              onClick={item.onClick as MouseEventHandler<HTMLButtonElement> | undefined}
              type="button"
            >
              {content}
            </button>
          );
        })}
      </div>
      {footer ? <div className="ml-sidebar-footer">{footer}</div> : null}
    </nav>
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  href,
  target,
  rel,
  leadingIcon,
  trailingIcon,
  children,
  className = "",
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const buttonClassName = cx(
    "ml-button",
    `ml-button--${variant}`,
    `ml-button--${size}`,
    disabled && "is-disabled",
    className
  );
  const content = (
    <>
      {leadingIcon ? <span className="ml-button-icon" aria-hidden="true">{leadingIcon}</span> : null}
      <span className="ml-button-label">{children}</span>
      {trailingIcon ? <span className="ml-button-icon" aria-hidden="true">{trailingIcon}</span> : null}
    </>
  );

  if (href) {
    const anchorProps = props as unknown as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a
        {...anchorProps}
        aria-disabled={disabled ? true : anchorProps["aria-disabled"]}
        className={buttonClassName}
        href={disabled ? undefined : href}
        rel={rel}
        tabIndex={disabled ? -1 : anchorProps.tabIndex}
        target={target}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      {...props}
      className={buttonClassName}
      disabled={disabled}
      type={type}
    >
      {content}
    </button>
  );
}

export function SearchBox({
  buttonLabel = "Search",
  hideButton = false,
  className = "",
  inputClassName = "",
  onSubmit,
  onValueChange,
  onChange,
  name = "query",
  disabled,
  ...inputProps
}: SearchBoxProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!onSubmit) {
      return;
    }

    event.preventDefault();
    const input = event.currentTarget.elements.namedItem(name);
    onSubmit(input instanceof HTMLInputElement ? input.value : String(inputProps.value ?? ""));
  }

  return (
    <form className={cx("ml-search-box", className)} role="search" onSubmit={handleSubmit}>
      <input
        {...inputProps}
        className={cx("ml-search-box-input", inputClassName)}
        disabled={disabled}
        name={name}
        onChange={(event) => {
          onChange?.(event);
          onValueChange?.(event.currentTarget.value);
        }}
        type="search"
      />
      {hideButton ? null : (
        <Button disabled={disabled} size="sm" type="submit" variant="primary">
          {buttonLabel}
        </Button>
      )}
    </form>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  footer,
  children,
  selected = false,
  bodyFlush = false,
  className = "",
  bodyClassName = ""
}: CardProps) {
  const hasHeader = title || subtitle || actions;

  return (
    <section className={cx("ml-card", selected && "is-selected", className)}>
      {hasHeader ? (
        <header className="ml-card-header">
          <div className="ml-card-heading">
            {title ? <h2 className="ml-card-title">{title}</h2> : null}
            {subtitle ? <p className="ml-card-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="ml-card-actions">{actions}</div> : null}
        </header>
      ) : null}
      {children ? (
        <div className={cx("ml-card-body", bodyFlush && "is-flush", bodyClassName)}>
          {children}
        </div>
      ) : null}
      {footer ? <footer className="ml-card-footer">{footer}</footer> : null}
    </section>
  );
}

export function Table<Row>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  selectedRowKey,
  empty,
  stickyHeader = false,
  density = "normal",
  className = ""
}: TableProps<Row>) {
  return (
    <div
      className={cx(
        "ml-table-wrap",
        stickyHeader && "has-sticky-header",
        `is-${density}`,
        className
      )}
    >
      <table className="ml-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                className={cx(column.headerClassName, column.align && `is-${column.align}`)}
                key={column.id}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="ml-table-empty" colSpan={columns.length}>
                {empty ?? "No data"}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => {
              const rowKey = getRowKey?.(row, rowIndex) ?? rowIndex;
              const isSelected = selectedRowKey !== undefined && selectedRowKey === rowKey;

              return (
                <tr
                  className={cx(onRowClick && "is-clickable", isSelected && "is-selected")}
                  key={rowKey}
                  onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
                >
                  {columns.map((column) => {
                    const value = column.render
                      ? column.render(row, rowIndex)
                      : column.accessor
                        ? (row[column.accessor] as ReactNode)
                        : null;

                    return (
                      <td
                        className={cx(column.className, column.align && `is-${column.align}`)}
                        key={column.id}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Badge({ tone = "neutral", children, className = "" }: BadgeProps) {
  return <span className={cx("ml-badge", badgeToneClass(tone), className)}>{children}</span>;
}

export function InspectorPanel({
  title,
  subtitle,
  action,
  children,
  footer,
  className = "",
  bodyClassName = ""
}: InspectorPanelProps) {
  return (
    <aside className={cx("ml-inspector", className)}>
      <header className="ml-inspector-header">
        <div className="ml-inspector-heading">
          <h2 className="ml-inspector-title">{title}</h2>
          {subtitle ? <p className="ml-inspector-subtitle">{subtitle}</p> : null}
        </div>
        {action ? <div className="ml-inspector-action">{action}</div> : null}
      </header>
      <div className={cx("ml-inspector-body", bodyClassName)}>{children}</div>
      {footer ? <footer className="ml-inspector-footer">{footer}</footer> : null}
    </aside>
  );
}
