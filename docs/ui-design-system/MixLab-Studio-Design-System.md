# MixLab Studio Design System

Version: V0.3 visual reset
Scope: MixLab Admin Web and MixLab Cutter Web
Status: proposed replacement for V0.2

## Why V0.3 Exists

V0.2 was cleaner, but it still looked like a generic structured dashboard. It had order, but not enough taste. MixLab needs to feel like a real production tool, not a styled admin page.

V0.3 changes the design goal:

- **Admin** becomes an operations task table, not a dashboard wall.
- **Cutter** becomes an editor workbench, not a dark admin interface.
- The interface should feel close to premium macOS creative/productivity software: quiet chrome, precise rows, restrained typography, and strong task focus.

## Product Taste Target

Use these references as taste direction, not visual copies:

- Linear: calm density, crisp hierarchy, strong row states.
- Cursor: dark professional workspace, low visual noise.
- Apple productivity apps: native-feeling spacing and typography.
- DaVinci Resolve / Final Cut Pro category: editor workbench logic, media-first workspace.

## Core Principles

### Interface As Instrument

The UI should feel like an instrument the user operates every day:

- Stable layout.
- Minimal decoration.
- Clear current context.
- Strong selection state.
- Fewer but more decisive actions.

### Chrome Is Quiet

Navigation, headers, sidebars, and status areas should stay visually quiet. They orient the user, but they should not compete with library data, search results, transcript text, or video preview.

### Rows Beat Cards

For operational tools, rows are often more elegant and faster than cards.

Use rows for:

- Source videos
- Preprocess jobs
- Cut tasks
- Search candidates
- User lists

Use cards only for:

- One dominant summary module
- Right-side inspector
- Empty states
- Dialog content

### The Primary Object Must Look Primary

On each page, the primary object is visually obvious:

- Admin dashboard: the attention queue.
- Source videos: the video table.
- Preprocess: job queue.
- Cutter home: project list.
- Material search: transcript selection and video preview.
- Cut tasks: task list.

## Shell

### Admin

- Light native shell.
- Sidebar width: 220-232px.
- Main background: `#fbfbfb`.
- Content is a task surface, not floating card grid.
- Right inspector is optional and narrow.
- Dashboard should not exceed 3 main vertical modules above the fold.

### Cutter

- Dark editor shell.
- Sidebar width: 220-232px.
- Workbench fills viewport height.
- No wasted top hero.
- Material search layout:
  - left: query and candidates
  - center: transcript
  - right: video and selected cut
- The selected transcript range is the most important visual state.

## Tokens

### Light

| Token | Value |
| --- | --- |
| canvas | `#fbfbfb` |
| sidebar | `#ffffff` |
| panel | `#ffffff` |
| panel muted | `#f6f6f6` |
| border | `#e6e6e6` |
| border strong | `#d8d8d8` |
| text | `#101010` |
| text muted | `#6f6f6f` |
| text faint | `#9a9a9a` |
| accent | `#111111` |
| focus | `#2563eb` |

### Dark

| Token | Value |
| --- | --- |
| canvas | `#08090b` |
| sidebar | `#0c0d10` |
| panel | `#101216` |
| panel raised | `#171a20` |
| panel muted | `#0d0f13` |
| border | `#262a32` |
| border strong | `#3a404c` |
| text | `#f4f4f5` |
| text muted | `#a1a1aa` |
| text faint | `#6f737d` |
| accent | `#e6f0ff` |
| selected | `#16253a` |

### Typography

Use the native macOS stack first:

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Text",
  "Inter",
  "PingFang SC",
  "Hiragino Sans GB",
  "Microsoft YaHei",
  system-ui,
  sans-serif;
```

Rules:

- Chinese UI text mostly 13-14px.
- Page title 24-28px only.
- Workbench title 16-18px.
- Numbers and timecodes use tabular numerals.
- Avoid multiple competing font sizes inside one module.

## Components

### Sidebar

- Quiet.
- Active item uses subtle fill.
- Icons are small.
- No bright colored sidebar background.

### Header

- Short.
- Contains context and one action cluster.
- No tall hero.

### Command Bar

Use for:

- Search
- Filter
- Primary next action

It should feel like one composed control row, not scattered buttons.

### Table / Row List

- Row height 44-64px.
- Header labels small and muted.
- Hover state subtle.
- Selected state clear.
- Row actions appear on hover or right side.

### Inspector

- Right-side detail panel.
- Shows selected object details.
- Avoid duplicating table information.
- One primary action at bottom or near top depending on workflow.

### Transcript

- Timecode column narrow.
- Text column readable.
- Current hit and selected range are visually distinct.
- Selection action is sticky and close to the text.

## Forbidden

- Dashboard card walls.
- Blue-tinted full workbench.
- Nested cards.
- Over-rounded pill controls everywhere.
- Multiple primary buttons in one module.
- Big colorful status badges.
- Decorative gradients.
- Raw engineering copy on normal pages.
- Whole-page refresh.
