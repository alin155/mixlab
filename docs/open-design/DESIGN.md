# MixLab DESIGN.md

This file is for Open Design. Use it as the design system direction for generating the MixLab Web App prototype.

## Brand Personality

MixLab should feel like a professional creative-operations tool for editing teams:

- Precise.
- Calm.
- Efficient.
- Trustworthy.
- Production-grade.
- Fast under real data.
- Designed for repeated daily work, not one-time demo viewing.

The product should feel closer to Linear / Notion / Cursor / Vercel than to a traditional admin dashboard.

## Visual Keywords

- Modern SaaS Web App.
- Tool-like.
- Clear hierarchy.
- Dense but breathable.
- Quiet confidence.
- Local-first production workflow.
- Editorial operations.
- Search-to-cut workspace.
- Stable status system.

## Color Palette

Use a neutral, restrained palette.

### Base

- Canvas: near white / very light gray.
- Surface: white.
- Subtle surface: cool gray.
- Border: low-contrast gray.
- Text primary: near black.
- Text secondary: medium gray.
- Text tertiary: muted gray.

### Accent

- Primary accent: restrained blue.
- Secondary accent: restrained green for healthy/ready.
- Use accent color sparingly for primary actions and active states.

### Semantic

- Ready / healthy: green.
- Processing / active: blue.
- Queued / neutral: gray.
- Attention / warning: amber.
- Failed / blocked / danger: red.
- Disabled: muted gray.

### Avoid

- Purple or purple-blue dominant gradients.
- Beige / cream / tan dominant themes.
- Dark blue/slate-dominated admin dashboard look.
- Brown / orange / espresso palettes.
- Neon colors.
- Decorative gradient blobs.

## Typography

- Use a clean system sans-serif.
- Chinese text must be highly readable at data-table density.
- Use compact headings inside panels.
- Reserve large type only for true page-level headings or major search entry.
- Do not scale font size with viewport width.
- Letter spacing must be 0.
- Tables and cards should use stable line heights.
- Numbers in KPI tiles should align visually and not jump during refresh.

## Spacing

- Use a 4px / 8px spacing rhythm.
- Dense product pages can use compact spacing, but every section must have a clear grouping boundary.
- Avoid oversized hero spacing except the cutter home search entry.
- Keep controls stable in width where counts update.
- Avoid nested cards and heavy decorative containers.

## Layout Rules

- Desktop-first.
- Use a persistent app shell with sidebar and main work area.
- Use right-side Inspector / Detail Panel for selected-object detail.
- Keep high-frequency actions close to the object they affect.
- Keep dangerous and low-frequency actions in detail panels, settings, drawers, or confirmation dialogs.
- Avoid full-page refresh patterns; design local loading and local refresh states.
- Use pagination, load more, or virtual scrolling for large lists and transcripts.
- Preserve route-level mental models:
  - Admin: dashboard, source videos, preprocess, cutter users, settings.
  - Cutter: project home, material locator, cut tasks, local library, public library, settings.

## Sidebar Rules

- Sidebar should be simple, calm, and persistent.
- Active item should be clear but not loud.
- Icons should be professional line icons.
- Do not show raw technical status in primary navigation.
- Cutter sidebar may show compact footer status: public materials, local materials, active tasks, local service, current user.
- Admin sidebar should not expose too many maintenance routes; Doctor can be accessed from status/settings unless product confirms main navigation.

## Header Rules

- Page header should state the task, not market the product.
- Header should contain at most one primary action.
- Search pages can put search in the header/command area.
- Long paths and runtime details should go into status rows or detail panels, not page title.
- Header height should not change when data refreshes.

## Card Rules

- Use cards for repeated items, KPI tiles, selected summary, project cards, and status blocks.
- Max radius: 8px.
- Do not put cards inside cards.
- Do not use decorative gradients.
- Each card should have one clear purpose.
- KPI cards should not become a wall of undifferentiated numbers.
- Status cards must explain why a status exists, not only color it.

## Table Rules

- Tables are appropriate for high-density operational data.
- Use sticky or stable headers when useful.
- Use compact rows, but preserve readability.
- First column should provide a strong scanning anchor.
- Row actions should be restrained; avoid too many visible buttons.
- Long paths and text must truncate gracefully with access to full value.
- Empty, loading, and error states must occupy the table area without layout jump.
- Pagination/load-more controls must be visible and understandable.

## Button Rules

- One primary action per section.
- Secondary buttons for safe supporting actions.
- Inline buttons for low-emphasis table actions.
- Danger buttons only for destructive actions.
- Disabled buttons must have nearby explanation or tooltip.
- Avoid equal visual weight for every action.
- Prefer icon buttons with tooltips for common tool actions where appropriate.
- Button labels should be short Chinese action verbs.

## Form Rules

- Group form fields by task.
- Save actions should be close to the form group they affect.
- Show dirty/saving/saved/error feedback.
- Path inputs need enough width and middle truncation display when read-only.
- Secret fields must never reveal stored values; show configured/unconfigured state.
- Numeric controls should use stepper or number input with clear min/max.
- Toggles are for binary settings; selects are for option sets.

## Status Color Rules

Every status must combine color + text.

- Green: ready, healthy, completed, approved.
- Blue: running, processing, active search, current selection.
- Gray: queued, idle, historical, disabled.
- Amber: attention, stale, needs observation, pending approval.
- Red: failed, blocked, disabled user, destructive confirmation.

Use “待恢复” for stale processing when a job is marked processing but the service is not running. Do not show it as normal running.

## Empty / Loading / Error State Rules

### Empty

- Always state what happened and what the user can do next.
- Do not use generic “暂无数据” alone.
- Empty states should be visually quiet but helpful.

### Loading

- First render should show shell immediately.
- Large lists load in pages.
- Search can show first batch, then continue loading.
- Use skeletons or stable placeholders; do not flash whole page.
- Local refresh should show per-panel loading.

### Error

- Use user-facing language first.
- Provide next action: retry, check service, return, open settings, run Doctor.
- Technical details may be collapsed in diagnostic contexts only.

## Data Density Rules

- MixLab is a high-density tool. Do not make it sparse like a landing page.
- Admin dashboard should summarize first, then expand into details.
- Cutter material locator can be dense, but the user must always see:
  - search input,
  - candidate list,
  - transcript,
  - video preview,
  - selection/cut action.
- Tables should paginate at small page sizes when data is large.
- Transcript should support virtualized design patterns.
- Avoid giant decorative cards that reduce usable data area.

## Motion Rules

- Minimal and functional.
- Use subtle transitions for hover, selection, drawer open/close.
- No flashy animations.
- No animated gradient backgrounds.
- Loading animation should not imply page instability.
- Live task progress may update, but layout dimensions must remain stable.

## Responsive Rules

Desktop is priority.

### Desktop

- Admin: sidebar + main content + optional right Inspector.
- Cutter material locator: multi-panel workbench with candidate list, transcript, video/selection side panel.
- Public/local libraries: gallery + Inspector.

### Tablet

- Inspector can collapse below or into drawer.
- Sidebar can compact.
- Tables can become horizontally scrollable.

### Mobile

- Need confirmation if mobile prototype is required.
- If included, prioritize navigation, search, and read-only browsing; complex cut workflow may use stacked panels.

## Accessibility Rules

- Use visible focus states.
- Do not rely only on color for status.
- Buttons and icon buttons need accessible names.
- Inputs require labels.
- Modal must have clear title and focus containment.
- Tables need readable headers.
- Dynamic search/status updates should be understandable with aria-live style behavior.
- Text contrast must pass WCAG AA.
- Hit targets should be at least 32px in dense desktop UI; 40px+ on touch.

## 禁止出现的设计风格

- 不要传统后台管理系统风格。
- 不要营销落地页风格。
- 不要大型 hero 视觉压过工作台。
- 不要花哨渐变。
- 不要渐变球、发光光斑、装饰性 bokeh。
- 不要低级 AI 生成感。
- 不要过度插画。
- 不要玻璃拟态泛滥。
- 不要把每个区块都做成大卡片。
- 不要按钮墙。
- 不要把“解锁/安全开关”作为主产品功能。
- 不要在普通页面暴露 raw backend terms，如 searchd、SQLite fallback、raw API URL、stack trace。
- 不要使用深色股票图、抽象科技背景或模糊视频截图作为主要视觉。
- 不要让文本溢出按钮、卡片或表格单元格。

## Product-Specific Design Priorities

1. Cutter Material Locator must be the most polished workflow.
2. Cutter Project Home must make project creation obvious.
3. Admin Dashboard must reduce noise and show a single next best action.
4. Admin Preprocess must clearly distinguish running, queued, failed, idle, and stale processing.
5. Public Library and Source Videos must clearly support pagination/load more.
6. Settings should absorb low-frequency and risky configuration.
7. Real-data performance and stable refresh states are part of the design, not engineering afterthoughts.
