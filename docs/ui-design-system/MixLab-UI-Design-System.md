# MixLab UI Design System

Version: V0.1 concept direction
Scope: MixLab Admin Web and MixLab Cutter Web
Purpose: provide a stable visual and interaction standard before rebuilding UI implementation.

> Superseded: this V0.1 Spectrum-inspired direction has been replaced by
> `MixLab-Geist-Design-System.md` for the next UI redesign pass. Keep this file
> only as historical context.

## 1. Product Design Position

MixLab is a production-grade video material operations system.

It has two different but connected experiences:

- **MixLab Admin**: a light, calm operations console for managing the public NAS material library, preprocessing state, visibility, cutter users, and settings.
- **MixLab Cutter**: a dark, focused search-to-cut workspace for editors who select projects, search real NAS source materials, inspect transcripts, preview video, and create clip tasks.

The design direction should borrow the maturity and restraint of Adobe Spectrum: professional creative tooling, precise density, quiet surfaces, predictable components, and strong accessibility. It should not look like a generic Chinese admin template, a landing page, or an AI-generated decorative dashboard.

## 2. Design Principles

### Workflow First

Every page must answer one user question quickly:

- Admin dashboard: "What needs my attention now?"
- Source videos: "Which materials are usable, failed, hidden, or waiting?"
- Preprocess: "What is running, failed, queued, or stale?"
- Cutter users: "Who can use the library?"
- Settings: "Where is the library and how does the system behave?"
- Cutter home: "Which project am I working on?"
- Material search: "Which source segment should I cut?"
- Cut tasks: "What has been created and what is its state?"
- Local library: "What reusable local clips do I already have?"
- Public library: "What source materials can I browse?"

### Two Apps, One Family

Admin and Cutter should feel related, not identical.

- Admin uses a light theme because it is a management and monitoring tool.
- Cutter uses a dark theme because it is a video/transcript workbench.
- Both share the same spacing rhythm, typography, status colors, density rules, and component behavior.

### Real Data Density

MixLab works with large libraries. The UI must be designed for thousands of videos and hundreds of thousands of transcript segments.

- First screen should render immediately with shell, header, and skeletons.
- Large lists must page, stream, or virtualize.
- Avoid full-page timed refresh.
- Live changes update per panel or per row.
- Counts should not resize cards when they change.

### Minimal Visible Operations

Users do not need many visible maintenance buttons.

- Put the most important next action in the page header or next-step card.
- Move dangerous, rare, or diagnostic actions into settings, detail panels, drawers, or confirmations.
- Do not expose test safety concepts as normal product concepts.
- Keep raw technical wording out of normal user-facing pages.

## 3. Brand Personality

- Professional
- Calm
- Precise
- Fast
- Focused
- Reliable
- Creative operations oriented
- Designed for repeated daily use

## 4. Visual Keywords

- Creative production tool
- Dense but breathable
- Clear hierarchy
- Search-to-cut workflow
- Calm SaaS console
- Stable operational status
- Local/NAS production environment
- No decorative noise

## 5. Theme Strategy

### Admin Light Theme

Admin should look like a modern SaaS operations console.

| Token | Value | Usage |
| --- | --- | --- |
| Canvas | `#F7F8FA` | App background |
| Surface | `#FFFFFF` | Panels, cards, tables |
| Surface Subtle | `#F1F3F6` | Section bands, inactive controls |
| Border | `#D9DEE7` | Card/table/control borders |
| Border Strong | `#C8D0DC` | Selected/important outlines |
| Text Primary | `#151A21` | Main copy |
| Text Secondary | `#5E6878` | Metadata |
| Text Tertiary | `#8893A4` | Helper text |
| Primary | `#1473E6` | Main action, active nav |
| Primary Hover | `#0D66D0` | Main action hover |
| Info Surface | `#EAF2FF` | Informational panels |

### Cutter Dark Theme

Cutter should look like a professional editing/search workspace, not a decorative dark dashboard.

| Token | Value | Usage |
| --- | --- | --- |
| Canvas | `#101318` | App background |
| Sidebar | `#141922` | Navigation |
| Surface | `#18212B` | Primary panels |
| Surface Raised | `#1F2A36` | Cards and active areas |
| Surface Sunken | `#0E1218` | Video wells |
| Border | `#2D3948` | Panel/control borders |
| Border Strong | `#42566D` | Selected outlines |
| Text Primary | `#F3F6FA` | Main text |
| Text Secondary | `#A9B4C3` | Metadata |
| Text Tertiary | `#748194` | Helper text |
| Primary | `#69A7FF` | Primary action, active nav |
| Primary Strong | `#8EBEFF` | Selected transcript/candidate |
| Selection Surface | `#233B59` | Active rows, transcript highlight |

### Semantic Colors

| Meaning | Light | Dark | Usage |
| --- | --- | --- | --- |
| Ready / Healthy | `#16845B` | `#4CC38A` | Ready video, healthy service |
| Processing / Active | `#1473E6` | `#69A7FF` | Running task, current search |
| Queued / Idle | `#6B7280` | `#9AA6B6` | Waiting, idle, historical |
| Attention | `#B26B00` | `#F1B44C` | Stale, warning, needs review |
| Failed / Danger | `#D31510` | `#FF7972` | Failed job, destructive confirmation |

Every semantic state must use both color and text. Never rely on color alone.

## 6. Typography

Preferred font stack:

```css
font-family:
  "Adobe Clean",
  Inter,
  "SF Pro Text",
  "PingFang SC",
  "Hiragino Sans GB",
  "Microsoft YaHei",
  system-ui,
  sans-serif;
```

Use a single font rhythm across both apps.

| Role | Size / Line Height | Weight | Usage |
| --- | --- | --- | --- |
| Page Title | 28 / 36 | 650 | Admin page title only |
| Workbench Title | 20 / 28 | 650 | Cutter page title, compact tools |
| Section Title | 16 / 24 | 650 | Panel headers |
| Card Title | 14 / 22 | 650 | KPI/card/table module title |
| Body | 14 / 22 | 400 | Normal text |
| Dense Body | 13 / 20 | 400 | Tables, transcript metadata |
| Caption | 12 / 18 | 400 | Secondary labels |
| Number | 24 / 32 | 650 | KPI numbers |
| Mono | 13 / 20 | 500 | Index version, IDs, timecode |

Rules:

- Letter spacing is always `0`.
- Avoid many font sizes inside one panel.
- Chinese labels should be short and readable at 13-14px.
- Timecodes, IDs, and index versions should use tabular numerals or monospace.

## 7. Spacing And Shape

Use a 4px base rhythm.

| Token | Value |
| --- | --- |
| 1 | 4px |
| 2 | 8px |
| 3 | 12px |
| 4 | 16px |
| 5 | 20px |
| 6 | 24px |
| 8 | 32px |
| 10 | 40px |

Shape:

- Small controls: 6px radius
- Cards and panels: 8px radius
- Search fields and pills: 10-16px radius only when the object is intentionally pill-shaped
- Do not use oversized rounded rectangles everywhere.
- Do not use nested cards.

## 8. App Shell

### Admin Shell

- Fixed left sidebar: 248px.
- Main content gutter: 24px desktop, 16px small desktop.
- Content max width: 1280-1360px unless the page is table-heavy.
- Header is part of content, not a heavy global top bar.
- Sidebar remains fixed during vertical scroll.
- Navigation items: 仪表盘, 原视频管理, 预处理, 剪辑师用户, 设置.
- Diagnostic/Doctor entry should live inside status/settings unless product confirms it belongs in primary navigation.

### Cutter Shell

- Fixed left sidebar: 224-240px.
- Main workspace fills the remaining viewport height.
- Cutter material search is a full-height workbench, not a regular scrolling card page.
- Navigation items: 首页, 素材搜索, 剪切任务, 本地素材, 公共素材库, 设置.
- Sidebar footer may show current editor/project/service state, but must stay compact.

## 9. Core Components

### Sidebar

Purpose: stable orientation and primary navigation.

Rules:

- Active state is clear but not loud.
- Icons are simple line icons.
- No large badges unless urgent.
- No raw engineering diagnostics in primary nav.
- Footer status should be one compact block only.

### Page Header

Purpose: state the page task and expose one key action.

Rules:

- One title, one short subtitle if needed.
- At most one primary action.
- Secondary actions can be grouped in a menu.
- Header dimensions must not change during refresh.

### Card / Panel

Purpose: group related operational information.

Rules:

- One idea per card.
- Use section title + short supporting metadata.
- Border and surface should define grouping; avoid shadow-heavy cards.
- Keep dimensions stable when data updates.

### KPI Tile

Purpose: quick scan of the current system state.

Rules:

- Label, number, optional delta/context.
- Use fixed numeric width where possible.
- Do not animate or flash on refresh.
- Use 4-6 KPIs maximum on dashboard.

### Table

Purpose: dense operational scan.

Rules:

- Header row 40-44px.
- Body rows 48-60px depending on content.
- Use row hover and selected states.
- Long paths truncate in middle or provide tooltip/detail panel.
- Row actions are hidden behind inline menu or one low-emphasis text action.
- Pagination is mandatory for large data.

### Button

Purpose: perform explicit commands.

Hierarchy:

- Primary: one main action per section.
- Secondary: safe supporting actions.
- Quiet: table rows and toolbar actions.
- Danger: destructive only, with confirmation.

Rules:

- Label should be short Chinese verb-object.
- Do not show five equally weighted buttons in one area.
- Disabled controls need a user-readable reason.

### Status Tag

Purpose: explain current state.

Rules:

- Use text + color + optional icon.
- Ready, Processing, Queued, Attention, Failed.
- Recoverable system degradation should say "需要关注" or "可继续使用", not raw backend terms.
- Stale processing must not look like active running.

### Search Box

Purpose: begin material discovery.

Rules:

- Cutter search is a primary command input.
- Query text must remain visible.
- Search button is fixed width.
- Filters are compact chips or segmented controls below the input.
- Search results can stream, but layout cannot jump.

### Transcript Viewer

Purpose: read and select precise video segments.

Rules:

- Timecode column: 56-72px fixed.
- Text column: flexible.
- Highlight query matches with subtle mark, not neon blocks.
- Selected range uses a continuous left rail or background.
- Selection action bar is pinned to bottom of transcript area.
- Transcript must support virtualization for large files.

### Video Preview

Purpose: verify selected source quickly.

Rules:

- 16:9 stable frame.
- Dark sunken preview well.
- Timeline controls are compact.
- Current selection should be visible in metadata near the preview.

### Detail / Inspector Panel

Purpose: show selected object details and next action.

Rules:

- Right side panel in dense workspaces.
- Contains selected source, selected time range, transcript preview, and primary action.
- Avoid duplicating candidate list information.

### Empty, Loading, Error

Rules:

- Empty: explain next step, not just "暂无数据".
- Loading: skeleton in the affected panel only.
- Error: user-facing message first, technical details collapsed.
- Processing: progress and current step, stable size.
- Disabled: visible reason and next recoverable action.

## 10. Admin Dashboard Blueprint

### Goal

Help the library manager know what needs attention first and whether the public library is usable for cutters.

### Layout

- Left fixed sidebar.
- Content header with breadcrumb, title "公共素材库仪表盘", subtitle, and one secondary local refresh action.
- Top attention banner only when there is real action needed.
- KPI row: 可用视频, 句子片段, 当前索引, 失败任务, 活跃剪辑师.
- Main grid:
  - Left 2/3: 下一步建议, 生产吞吐, 最近预处理任务.
  - Right 1/3: 公共库摘要, 核心链路健康, 发布状态.

### Interaction

- "重试失败视频" appears only when failures exist.
- Each KPI can link to a filtered detail page.
- Refresh is local and per panel; no full-page flashing.
- Diagnostic details are hidden behind "查看详情".

### Visual Notes

- Light theme.
- White cards on cool gray canvas.
- No more than one blue primary button above the fold.
- Status language must be user-facing.

## 11. Cutter Material Search Blueprint

### Goal

Help the editor find a reusable segment from the public NAS source library and create a cut task with minimal friction.

### Layout

Full-height dark workbench.

- Left sidebar: project and primary navigation.
- Workbench grid:
  - Left column 320px: search command, filters, candidate materials.
  - Center column fluid: transcript timeline and selectable text.
  - Right column 360px: video preview, selected range, cut action, recent tasks.
- Bottom of transcript: pinned selection action bar.

### Interaction

- Search runs inside the project context.
- Candidate list loads in pages or batches.
- Selecting a candidate loads transcript and preview.
- Selecting transcript text/time range updates right inspector.
- "剪切这段" is the one primary action.
- Recent tasks show the latest output state without taking over the page.

### Visual Notes

- Dark creative-tool theme.
- High density, but every column has one clear job.
- Video, transcript, and selection must be visible at the same time on desktop.
- Do not use giant pills, oversized buttons, or random chip clusters.

## 12. Page Priority For Redesign

1. Cutter Material Search: hardest and most valuable workflow.
2. Cutter Project Home: project entry and mental model.
3. Admin Dashboard: operational trust and system overview.
4. Admin Source Videos: real NAS data management and pagination.
5. Cutter Public Library: browsing and paging real source materials.
6. Preprocess Jobs: job state clarity.
7. Cut Tasks: output confidence.
8. Settings: low-frequency but important configuration.

## 13. Forbidden Styles

Do not use:

- Generic Ant Design admin look.
- Decorative gradient orbs or background blobs.
- Purple-blue gradient-heavy AI style.
- Oversized hero layout for production tools.
- Equal-weight button groups everywhere.
- Full-page auto-refresh.
- Raw backend terms in normal user pages.
- Dense controls without column hierarchy.
- Cards inside cards.
- Large rounded rectangles for every control.
- Flashing or layout-shifting live data.
- Fake/mock-looking numbers or placeholder-only pages.

## 14. Image Concept Prompt Notes

When generating visual concepts, render as desktop web app screenshots, 1440x900, realistic UI, no marketing hero, no fake browser chrome.

### Admin Dashboard Prompt Direction

Light SaaS operations console, fixed left sidebar, cool gray canvas, white cards, one primary action, KPI row, attention banner, next-step card, public library summary, core link health, production throughput, recent tasks. Chinese UI labels. Mature Adobe Spectrum-like product quality. No gradients, no decorative blobs, no generic admin clutter.

### Cutter Material Search Prompt Direction

Dark professional video search workbench, fixed left sidebar, three-column full-height workspace: search and candidate list left, transcript center, video preview and selected range inspector right. Chinese UI labels. Compact controls, clear hierarchy, single primary cut action. Mature creative tool style similar to Adobe Spectrum and professional editing software. No neon, no clutter, no oversized pills.
