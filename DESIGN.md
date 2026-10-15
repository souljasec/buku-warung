---
name: Pembukuan Warung
description: The month as a wall calendar; every day stamped untung or rugi.
colors:
  paper: "#f7f4ee"
  sheet: "#fffdf8"
  ink: "#1d2a25"
  muted: "#56635d"
  line: "#e2dccf"
  line-soft: "#ece7dc"
  green: "#1f5f4a"
  green-ink: "#174a39"
  green-soft: "#e1ede6"
  green-tint: "#cfe3d8"
  amber: "#a35f0a"
  amber-strong: "#8a4f06"
  amber-soft: "#fbeedb"
  amber-bar: "#e3a13b"
  brick: "#b0402a"
  brick-soft: "#f7e1db"
  data-2: "#7d8b84"
  on-green: "#ffffff"
  on-amber: "#ffffff"
  paper-night: "#111a16"
  sheet-night: "#18231e"
  ink-night: "#ecf1ee"
  muted-night: "#a8b5ae"
  line-night: "#2b3832"
  green-night: "#74c7a3"
  green-soft-night: "#1d3329"
  amber-night: "#f0b45c"
  amber-soft-night: "#3a2c17"
  brick-night: "#f08b72"
  brick-soft-night: "#3b211b"
  data-2-night: "#6d7c75"
  on-green-night: "#0c1f17"
  on-amber-night: "#1f1405"
typography:
  display:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif"
    fontSize: "clamp(1.6rem, 8vw, 2.3rem)"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  amount:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif"
    fontSize: "2.4rem"
    fontWeight: 800
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 700
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 600
  cell:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif"
    fontSize: "0.74rem"
    fontWeight: 800
    fontFeature: "tnum"
  mono:
    fontFamily: "ui-monospace, Menlo, Consolas, monospace"
    fontSize: "0.95rem"
    fontWeight: 400
rounded:
  cell: "10px"
  control: "12px"
  block: "14px"
  fab: "18px"
  verdict: "18px"
  sheet: "22px"
  pill: "99px"
spacing:
  hair: "3px"
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "16px"
  tabs: "64px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.on-green}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
    height: "46px"
  button-action:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-amber}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
    height: "46px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
    height: "46px"
  fab:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-amber}"
    rounded: "{rounded.fab}"
    size: "62px"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "46px"
  chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "6px 13px"
    height: "36px"
  chip-on:
    backgroundColor: "{colors.green}"
    textColor: "{colors.on-green}"
    rounded: "{rounded.pill}"
  pill-select:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 26px 4px 11px"
    height: "34px"
  verdict-card:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.verdict}"
    padding: "14px 16px 12px"
  block:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.block}"
    padding: "14px"
  day-cell-up:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.cell}"
  day-cell-down:
    backgroundColor: "{colors.brick-soft}"
    textColor: "{colors.brick}"
    rounded: "{rounded.cell}"
  day-cell-empty:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.cell}"
  key:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.block}"
    height: "54px"
  tab-bar:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.muted}"
    height: "64px"
---

# Design System: Pembukuan Warung

## Overview

**Creative North Star: "The Wall Calendar"**

The warung's month hangs on the wall as a calendar, and every day carries a stamp: a green square with a ▲ for untung, a brick square with a ▼ for rugi. The headline is the month's profit in big tabular rupiah, set in a single verdict card with the 12-month strip beneath it. Nothing competes with that verdict; there are no KPI tiles and no transaction feed on the home screen.

Material is warm paper (paper ground, slightly brighter sheets) with soft ambient shadows, system sans in heavy weights, and thumb-sized targets for a tired owner on a cheap Android phone. Dark mode re-steps the same three hues (green, amber, brick) for night use; it is not a different palette.

**Key Characteristics:**
- One verdict grammar everywhere: label, ▲/▼ + amount, "untung/rugi · margin N%", then sales/spending split. Month, day and reports share it.
- Green = structure and profit; brick = loss; amber = action and today only.
- Tabular numerals on every amount; calendar cells show thousands without the "Rp" unit.
- Phone first: bottom tab bar, amber FAB, sheets that rise from the bottom. Desktop: rail + calendar + persistent day panel.

## Colors

Warm neutrals with three meaning-bearing hues; every hue has a soft fill partner.

### Primary
- **Warung Green** (green): profit, primary buttons, selected tab, selected chips, links, focus border on inputs, the 12-month strip bars. **Green Ink** is its text tone on green-soft fills; **Green Soft** fills profitable day cells, the active tab pill and pill selects; **Green Tint** is text selection.

### Secondary
- **Market Amber** (amber): the + FAB, the "Tambah" action button, the today ring on the calendar, focus outlines, the caret, the "Hari ini" label (amber-strong). **Amber Soft** backs notes/reminders and the personal pill; **Amber Bar** is the toast's undo action on the ink toast.

### Tertiary
- **Brick** (brick): loss only. Loss day cells (brick-soft fill, brick ▼ amount), negative strip bars, rugi verdicts.

### Neutral
- **Paper** (paper): app ground, keypad keys, unselected chips.
- **Sheet** (sheet): cards, blocks, inputs, tab bar, the sheet dialog.
- **Ink** (ink) / **Muted** (muted): text and secondary text; ink also backs the toast.
- **Line / Line Soft**: input strokes, dividers between rows, empty-cell hairlines, bar tracks.
- **Data Grey** (data-2): the second data series in reports (spending bars, category bars).

### Named Rules
**The Amber Is A Verb Rule.** Amber marks only what you can do now (FAB, Tambah, links that act, focus) and today. Never use it as a data series or decoration.

**The Three Meanings Rule.** Green means profit, brick means loss, data grey means the other series. A chart never introduces a fourth hue.

**The Same Hues At Night Rule.** Dark mode uses the `-night` steps of the same tokens; text on green/amber becomes dark (on-green-night, on-amber-night).

## Typography

**Body Font:** system-ui stack (-apple-system, Segoe UI, Roboto, Noto Sans)
**Mono:** ui-monospace, only for the paste-notes textarea and inline `code` shorthand examples.

**Character:** One native sans, carried by weight (600-800) rather than family. Numbers are the hero and always tabular.

### Hierarchy
- **Display** (800, clamp 1.6-2.3rem, 1.12): the verdict amount on month, day and reports.
- **Amount** (800, 2.4rem, right-aligned): the keypad entry.
- **Headline** (700, 1.35rem): month name between ‹ ›.
- **Title** (700, 1.1rem; block heads 1rem): block and sheet titles.
- **Body** (400, 16px/1.45): everything else; hints at 0.88rem muted.
- **Label** (600, 0.85rem, muted): field labels, verdict label, legend. Tabs at 0.72rem/600.
- **Cell** (800, 0.74rem, tabular): the ▲/▼ thousands figure in calendar cells; day number 0.88rem.

### Named Rules
**The Tabular Rupiah Rule.** Every amount uses tabular numerals and never wraps (`white-space: nowrap`).

## Layout

- **Phone (default):** single column, `main` max 640px, 16px side padding, bottom padding clears the 64px tab bar plus safe area. Sticky today bar (min 62px) sits above the tabs with a 76px right margin so the FAB sits beside it, not over it.
- **Calendar:** 7 columns, 3px gaps, cells at 1:1.08 aspect, weekday row in 0.72rem muted bold. 12-month strip: 12 equal full-height tap columns, 52px tall.
- **Tablet (≥600px):** larger cell type (number 1rem, figure 0.84rem); form rows go inline; sheet dialog centers with 22px corners all round.
- **Desktop (≥960px):** three columns: 92px rail (tabs become a vertical rail, FAB moves to its top-left), month main (max 760px), and a 360-420px sticky day panel. Selected day gets a 2.5px green inset ring. Reports, Menu and More drop the panel (two columns).
- **Rhythm:** 6 / 10 / 14 / 16px steps; blocks stack with 12px top margin; list rows min 52px with soft-line dividers.

## Elevation & Depth

Paper-on-paper with soft ambient lift. Sheets sit slightly brighter than the ground and carry one shared shadow; calendar cells are flat (tinted fill or 1px inner hairline).

### Shadow Vocabulary
- **Ambient** (`0 1px 2px rgba(29,42,37,.06), 0 8px 24px -12px rgba(29,42,37,.22)`; night variant darker): verdict card, blocks, today bar, active segment.
- **FAB lift** (`0 2px 4px rgba(0,0,0,.14), 0 10px 22px -10px rgba(0,0,0,.45)`): the amber + only.
- **Sheet** (`0 -8px 40px rgba(0,0,0,.25)`, backdrop `rgba(17,26,22,.45)`): the keypad dialog.

### Named Rules
**The Flat Calendar Rule.** Day cells never carry a drop shadow; state is shown with fill (green-soft / brick-soft) and inset rings (amber today, green selected).

## Shapes

Gently rounded, nested by size: cells 10px, controls 12px, blocks and keys 14px, verdict card and FAB 18px, sheet 22px, pills and chips fully round. Rings are inset box-shadows, not borders. Incomplete data is drawn as an outline: months with sales but no recorded spending appear as hollow (outlined, dashed in the report chart) bars, labelled "pengeluaran belum dicatat".

## Components

### Buttons
- **Primary:** green fill, white text, 700, min 46px, 12px radius; hover brightens 7%; disabled 45% opacity.
- **Action (amber):** same shape in amber; only for adding money out.
- **Ghost:** transparent with 1.5px line inset ring.
- **Big:** full width, 56px, 16px radius (save in keypad/day). **Small:** 36px, 10px radius.
- **Icon button:** 44px square (36px small), hover line-soft fill.
- **Focus:** 2.5px amber outline, 2px offset, everywhere.

### FAB
62px amber square at 18px radius with a 28px plus; bottom-right above the tab bar on phones, top of the rail on desktop; presses to 0.94 scale; hidden while a sheet is open.

### Verdict Card
Sheet card, 18px radius, ambient shadow. Label (muted) → ▲/▼ + display amount in tone color → "untung · margin N%" in tone → optional amber-strong warning with an action link → muted split with ink tabular values → (month only) 12-month strip.

### Day Cell
Number top-left, ▲/▼ + thousands bottom. Profit: green-soft fill, green-ink figure. Loss: brick-soft fill, brick figure. No data: sheet with 1px soft inner line. Future: muted number. Today: 2.5px amber inset ring and amber-strong number. Pressing scales to 0.96.

### Today Bar
Sticky sheet strip, 14px radius, ambient shadow: amber-strong "Hari ini", two tabular figures with tiny muted labels, chevron.

### Chips and Pill Selects
- **Chips:** paper fill with 1.5px line ring, fully round, 36px. Selected: green fill. Toggle chips (kind) select to amber.
- **Pill select:** expense-row category select, green-soft fill, green-ink 0.8rem bold, custom chevron, 34px. The labelled "Kategori lain" select in the keypad uses the paper/ring chip style.
- **Pill (tag):** 0.72rem bold on line-soft; personal on amber-soft, own money on green-soft.

### Inputs
Sheet fill, 1.5px line stroke, 12px radius, min 46px, tabular. Focus: green border plus 3px green-soft halo. Labels stack above in 0.85rem muted 600.

### Keypad Sheet
Bottom sheet (22px top corners) rising 24px over .3s. Right-aligned 2.4rem amount (muted when zero) with a hint below, category chips, 3-column keys of 54px paper buttons at 14px radius, full-width big save.

### Navigation
Bottom tab bar, 4 tabs (Bulan, Laporan, Menu, Lainnya), sheet background with top hairline, 22px custom SVG icons from the sprite and 0.72rem labels. Active: green text and a 52px-wide green-soft pill behind the icon. Becomes a 92px vertical rail at ≥960px.

### Day Sheet / Panel
Full-screen paper sheet on phones with a sticky header (‹ date ›, close); persistent right panel on desktop. Content stacks the day verdict, then blocks: money out (compact rows: bold amount, muted note, pill select, trash), count money, item tally.

### Report Charts
Inline SVG bar pairs (green sales, data-grey spending), 9px muted labels; non-current months at 62% opacity; tapping a month writes a caption. Horizontal bars: 8px tracks, data-grey for categories, green for bestsellers.

### Toast
Ink pill-ish (14px) toast above the FAB, rising 20px; undo action in amber-bar.

### Motion
Short and settling: `cubic-bezier(.16, 1, .3, 1)` for rises (sheets .3-.32s, FAB, toast .3s); ease-out .15-.2s for presses and chevrons. All animation and transition is removed under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** use the verdict grammar (label, ▲/▼ amount, untung/rugi · margin, split) for any period summary.
- **Do** pair every loss/profit color with its ▲/▼ mark so meaning survives without color (forced-colors adds a border).
- **Do** keep tap targets at 44px or more (controls 46px, keys 54px, list rows 52px).
- **Do** draw incomplete data hollow or dashed with the "pengeluaran belum dicatat" wording.
- **Do** take icons from the in-page SVG sprite (stroke 2, round caps, 22px).

### Don't:
- **Don't** use amber for data, charts or decoration; data grey is the second series.
- **Don't** add drop shadows to calendar cells or a dashboard of KPI cards above the calendar.
- **Don't** put "Rp" inside calendar cells; cells show thousands only.
- **Don't** introduce a webfont or a fourth meaning hue.
