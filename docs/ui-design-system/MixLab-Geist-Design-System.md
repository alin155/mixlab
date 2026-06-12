# MixLab Geist Design System

Version: V0.2 design direction reset
Scope: MixLab Admin Web and MixLab Cutter Web
Purpose: define a more elegant, mature UI direction before another implementation pass.

## 1. Why This Direction

The previous UI pass improved consistency, but it still read as an engineering console: many visible boxes, mixed density, heavy borders, and page-level layouts that did not feel designed from first principles.

MixLab should not look like a generic backend dashboard. It is a professional material production system with two linked experiences:

- **Admin**: a calm operations console for a real NAS public library.
- **Cutter**: a focused editorial workbench for searching transcripts, previewing video, and creating cuts.

The new direction uses:

- **Geist / Vercel** as the visual language reference: minimal surfaces, high contrast text, restrained components, precise spacing, and developer-tool maturity.
- **Radix Themes** as the component completeness reference: buttons, fields, cards, tables, dialogs, tooltips, scroll areas, tabs, segmented controls, skeletons.
- **Base UI** as the accessibility and headless interaction reference when custom styling is needed.
- **shadcn/ui** as a component composition reference only, not as a visual skin to copy blindly.

Official references:

- Geist Design System: https://vercel.com/geist/introduction
- Radix Themes: https://www.radix-ui.com/themes/docs/overview/getting-started
- Base UI: https://base-ui.com/react/overview/about
- shadcn/ui: https://ui.shadcn.com/docs

## 2. Product Personality

MixLab should feel:

- Quietly powerful
- Fast
- Dense but legible
- Precise
- Editorial
- Trustworthy around real NAS data
- Designed for repeat daily work

MixLab should not feel:

- Like a template admin panel
- Like a marketing landing page
- Like a neon video tool
- Like a prototype made from random cards
- Like an engineering/debug dashboard exposed to normal users

## 3. Core Design Principles

### 3.1 One Page, One Job

Every page must have one dominant user question:

- Admin dashboard: What needs attention now?
- Source videos: Which original videos are ready, failed, hidden, or waiting?
- Preprocess: What is queued, running, failed, or ready to retry?
- Cutter users: Who can use the library and what is their current capacity?
- Settings: Where is the library and what behavior is configured?
- Cutter home: Which project should I enter?
- Material search: Which exact source segment should I cut?
- Cut tasks: What has been created and what still needs processing?
- Local library: Which reusable clips already exist?
- Public library: What source materials can I browse and reuse?

### 3.2 Visible UI Must Be User Language

Default pages should not expose raw engineering terms such as service names, fallback internals, database names, API addresses, or test safety switches.

Allowed on ordinary pages:

- 可用
- 处理中
- 需要处理
- 等待中
- 最近更新
- 已发布
- 未发布
- 可重试

Move diagnostic detail into:

- Settings
- Detail drawer
- System check page
- Confirmation dialog
- Tooltip for advanced users

### 3.3 Fewer Controls, Stronger Intent

Primary pages should show:

- One primary action at most.
- One secondary action group if needed.
- Filters only where they directly reduce list/search workload.
- Dangerous or rare actions behind confirmation or details.

Avoid:

- Button strips with similar visual weight.
- Always-visible maintenance controls.
- Multiple badges saying the same thing.
- Controls that look clickable but are informational only.

### 3.4 Stable Layout First

The app shell must feel fixed, predictable, and fast.

- Sidebar is fixed.
- Page header does not jump.
- List pagination does not resize the whole page.
- Dashboard data refreshes per panel or row, never by remounting the whole page.
- Cutter material search uses a fixed-height workbench.

### 3.5 Real Data Density

MixLab handles thousands of videos and hundreds of thousands of transcript fragments.

Design assumptions:

- Initial page data should be a small first page.
- Lists use pagination, virtualization, or incremental load.
- Tables reserve stable column widths.
- Numbers use tabular numerals.
- Long paths and IDs middle-truncate.
- Empty/loading/error states occupy the same layout as loaded content.

## 4. Design Tokens

### 4.1 Typography

Use one font rhythm across both apps.

```css
font-family:
  "Geist",
  "Inter",
  "SF Pro Text",
  "PingFang SC",
  "Hiragino Sans GB",
  "Microsoft YaHei",
  system-ui,
  sans-serif;
```

Rules:

- Letter spacing: `0`.
- Use tabular numbers for counts, timecodes, durations, and versions.
- Use mono only for IDs, versions, paths, and timecodes.
- Do not mix multiple decorative weights in one panel.

| Role | Size | Line Height | Weight |
| --- | ---: | ---: | ---: |
| Admin page title | 28px | 36px | 650 |
| Cutter workbench title | 18px | 26px | 650 |
| Section title | 15px | 22px | 600 |
| Body | 14px | 22px | 400 |
| Dense body | 13px | 20px | 400 |
| Caption | 12px | 18px | 400 |
| KPI number | 24px | 32px | 650 |
| Timecode / ID | 12px | 18px | 500 mono |

### 4.2 Radius

Use radius sparingly.

| Object | Radius |
| --- | ---: |
| App shell / page panels | 0-8px |
| Cards | 8px |
| Buttons | 6px |
| Inputs | 8px |
| Pills / segmented controls | 999px only when semantically pill-shaped |

No nested card-on-card styling unless the inner object is a real repeated item.

### 4.3 Spacing

Use a 4px base rhythm.

| Token | Value |
| --- | ---: |
| 1 | 4px |
| 2 | 8px |
| 3 | 12px |
| 4 | 16px |
| 5 | 20px |
| 6 | 24px |
| 8 | 32px |
| 10 | 40px |

Page-level rhythm:

- Sidebar padding: 16px.
- Admin content gutter: 24px.
- Cutter workbench gutter: 10-12px.
- Panel header padding: 14-16px.
- Dense list row height: 48-64px.

## 5. Color System

### 5.1 Admin Light

Admin should be mostly white and near-white. Avoid blue-tinted full-page backgrounds.

| Token | Value | Use |
| --- | --- | --- |
| `--mx-bg` | `#fafafa` | page canvas |
| `--mx-panel` | `#ffffff` | panels |
| `--mx-panel-subtle` | `#f5f5f5` | selected nav, subtle blocks |
| `--mx-border` | `#e5e5e5` | default border |
| `--mx-border-strong` | `#d4d4d4` | selected/active border |
| `--mx-text` | `#0a0a0a` | primary text |
| `--mx-text-muted` | `#666666` | secondary text |
| `--mx-text-faint` | `#8a8a8a` | helper text |
| `--mx-accent` | `#111111` | primary action |
| `--mx-focus` | `#0070f3` | focus ring, link |

### 5.2 Cutter Dark

Cutter should be dark but not blue-washed. Use neutral black/charcoal with one cool accent.

| Token | Value | Use |
| --- | --- | --- |
| `--mx-bg` | `#08090a` | app canvas |
| `--mx-sidebar` | `#0d0f12` | sidebar |
| `--mx-panel` | `#111318` | primary panels |
| `--mx-panel-subtle` | `#171a21` | active rows |
| `--mx-panel-raised` | `#1c2028` | selected cards |
| `--mx-border` | `#282d36` | panel borders |
| `--mx-border-strong` | `#3a414d` | active borders |
| `--mx-text` | `#f5f5f5` | primary text |
| `--mx-text-muted` | `#a1a1aa` | secondary text |
| `--mx-text-faint` | `#71717a` | helper text |
| `--mx-accent` | `#7db2ff` | active selection |
| `--mx-accent-soft` | `#132238` | selected surface |

### 5.3 Status Colors

Status colors should be small accents, not full-card decoration.

| State | Light | Dark | User Copy |
| --- | --- | --- | --- |
| ready | `#0f7b4f` | `#43d18b` | 可用 |
| processing | `#006adc` | `#7db2ff` | 处理中 |
| queued | `#737373` | `#a1a1aa` | 等待中 |
| attention | `#a35c00` | `#f0b44c` | 需要关注 |
| danger | `#c02626` | `#ff6b63` | 需要处理 |

## 6. App Shell Rules

### 6.1 Admin Shell

- Fixed sidebar width: 232-248px.
- Sidebar background: white.
- Sidebar border: 1px right border only.
- Active nav item: subtle gray fill, dark text, no bright block.
- Main content starts at x=sidebar width and scrolls independently.
- Page header contains breadcrumb, title, supporting sentence, and 1-2 actions.
- Dashboard uses one main column plus one right inspector on wide screens.
- Table-heavy pages may use full width.

### 6.2 Cutter Shell

- Fixed sidebar width: 220-236px.
- Sidebar background: near-black.
- Workbench fills viewport height.
- Material search is a three-zone tool:
  1. Query and candidate list.
  2. Transcript timeline.
  3. Preview and cut inspector.
- Bottom selection bar is sticky inside the workbench, not a floating random pill.
- Top chrome should be minimal or absent; do not waste vertical space.

## 7. Component Rules

### 7.1 Buttons

Button hierarchy:

1. Primary: solid black in admin, light accent in cutter.
2. Secondary: neutral bordered.
3. Ghost: text/icon only.
4. Danger: only inside confirm or rare destructive action.

Rules:

- Height 32px compact, 36px normal.
- Radius 6px.
- One primary button per page section.
- Icon buttons require tooltip.
- Disabled buttons must explain why on hover or nearby text.

### 7.2 Inputs And Search

Search is a first-class object in Cutter.

- Admin search: compact input in table/filter toolbar.
- Cutter search: prominent command field with source scope, query, result count, and clear affordance.
- Use one clear search affordance, not many small chips competing with it.
- Search loading state should update the result count line and candidate skeletons.

### 7.3 Tables

Admin tables:

- Header row sticky when list scrolls inside a panel.
- Row height 48-56px.
- Primary entity in first column.
- Status column near primary entity.
- Actions are compact and right-aligned.
- Use pagination footer, not infinite unknown scrolling for management pages.

Cutter tables/lists:

- Candidate rows can be denser and more visual.
- Selected candidate has a clear left indicator and darker selected fill.
- Thumbnail, title, transcript size, duration, and match count must align consistently.

### 7.4 Cards And Panels

- Cards are for individual repeated entities or major dashboard modules.
- Page sections should not all be styled as floating cards.
- Avoid deeply nested cards.
- KPI cards should be compact and consistent.
- Important alerts should use a thin left status bar or callout, not huge colorful panels.

### 7.5 Status Tags

- Small dot + label preferred.
- Avoid large colored pills everywhere.
- Same state always uses the same copy.
- Technical explanation goes into detail text, not the tag label.

### 7.6 Loading / Empty / Error

Each page must preserve layout while changing state.

Loading:

- Skeleton rows/cards.
- Keep header and filters visible.
- Avoid spinners as the main layout.

Empty:

- Explain what is empty in user language.
- Offer one next action if meaningful.

Error:

- State what the user can do.
- Keep technical details in expandable details.

Processing:

- Show progress, current stage, and stable row state.
- Do not make historical processing artifacts look actively running.

## 8. Page-Level Direction

### 8.1 Admin Dashboard

Goal: show the most important next step and overall library readiness.

Layout:

- Fixed sidebar.
- Header with title and actions.
- Thin attention callout if needed.
- 4-5 KPI tiles, no more.
- Main column:
  - Next step card.
  - Core path health.
  - Production queue / recent issues.
- Right inspector:
  - Library summary.
  - Last scan/publish.
  - Status notes.

Avoid:

- Full-page refresh.
- Too many buttons.
- Raw service names.
- Multiple cards saying similar things.

### 8.2 Cutter Material Search

Goal: let an editor find, inspect, and cut a precise source segment quickly.

Layout:

- Fixed dark sidebar.
- Left command column:
  - Project context.
  - Search field.
  - Source filters.
  - Candidate list.
- Center transcript column:
  - Current video metadata.
  - Transcript rows with timecodes.
  - Current hit and selected range.
- Right inspector column:
  - Video preview.
  - Selection details.
  - Cut action.
  - Recent tasks.

Avoid:

- Blue-heavy full-page color wash.
- Random floating pills.
- Over-rounded controls.
- Repeated cards inside cards.
- Making every metadata item look like a button.

## 9. Implementation Guidance For Later

This document is not asking to rewrite business logic.

When implementation starts, prefer:

- A clean token layer in `packages/ui-foundation`.
- Fewer global CSS overrides.
- Page-specific layout files for admin dashboard and cutter material search.
- Shared primitives for buttons, status, table, list rows, empty/loading/error.
- Visual regression screenshots before and after each route.

Implementation should be staged:

1. Finalize design direction with static concepts.
2. Convert tokens and primitive components.
3. Rebuild admin shell and common controls.
4. Rebuild admin pages.
5. Rebuild cutter shell and common controls.
6. Rebuild cutter pages, with material search first.
7. Run browser screenshot QA across all routes.

## 10. Forbidden Style

Do not use:

- Generic admin template sidebars.
- Full-page purple/blue gradients.
- Decorative blobs or orbs.
- Huge hero sections.
- Over-rounded button/card language.
- Dense bright borders around every region.
- Heavy shadows.
- Fake glassmorphism.
- Marketing-style cards.
- Engineering/debug terminology as primary UI copy.
- Multiple primary buttons in the same decision area.
- Whole-page timed refresh behavior.
