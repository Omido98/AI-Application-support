---
version: alpha
name: Inkwell
description: "A writer's desk for job hunting — warm charcoal paper, a single ink-teal accent, and AI documents set in serif. Dark theme is the normative palette."
colors:
  background: "#14120f"
  foreground: "#f2ede4"
  surface: "#1e1b17"
  surface-alt: "#262219"
  border: "#3a352c"
  primary: "#34d399"
  primary-hover: "#3bd9a8"
  on-primary: "#0d2b22"
  secondary: "#a8a094"
  muted: "#8a8376"
  error: "#f87171"
  on-error: "#330b0b"
  ring: "#34d399"
  selection: "#24312c"
  status-wishlist-bg: "#2a2620"
  status-wishlist-fg: "#a8a094"
  status-applied-bg: "#1d2b3a"
  status-applied-fg: "#93c5fd"
  status-interview-bg: "#33291a"
  status-interview-fg: "#fbbf24"
  status-offer-bg: "#1c2f24"
  status-offer-fg: "#4ade80"
  status-rejected-bg: "#331d1a"
  status-rejected-fg: "#f87171"
typography:
  headline-lg:
    fontFamily: Geist Variable
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist Variable
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Geist Variable
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.4
  body-lg:
    fontFamily: Geist Variable
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: Geist Variable
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: Geist Variable
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: Geist Variable
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  label-md:
    fontFamily: Geist Variable
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
  label-sm:
    fontFamily: Geist Variable
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
  mono-sm:
    fontFamily: Geist Mono Variable
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  mono-xs:
    fontFamily: Geist Mono Variable
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
  doc-lg:
    fontFamily: Source Serif 4 Variable
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.75
  doc-sm:
    fontFamily: Source Serif 4 Variable
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: 6px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  card-padding: 20px
  card-gap: 16px
  sidebar-width: 256px
  doc-column: 768px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 0 12px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 0 12px
  button-outline:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 0 12px
  button-destructive:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 0 12px
  status-chip:
    rounded: "{rounded.full}"
    typography: "{typography.label-sm}"
    padding: 2px 10px
  status-chip-wishlist:
    backgroundColor: "{colors.status-wishlist-bg}"
    textColor: "{colors.status-wishlist-fg}"
  status-chip-applied:
    backgroundColor: "{colors.status-applied-bg}"
    textColor: "{colors.status-applied-fg}"
  status-chip-interview:
    backgroundColor: "{colors.status-interview-bg}"
    textColor: "{colors.status-interview-fg}"
  status-chip-offer:
    backgroundColor: "{colors.status-offer-bg}"
    textColor: "{colors.status-offer-fg}"
  status-chip-rejected:
    backgroundColor: "{colors.status-rejected-bg}"
    textColor: "{colors.status-rejected-fg}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card-padding}"
  chat-user-bubble:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px 16px
  chat-document:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    borderWidth: 1px
    textColor: "{colors.foreground}"
    typography: "{typography.doc-sm}"
    rounded: "{rounded.md}"
    padding: 12px 16px
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  helper-text:
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
  cursor-stream:
    backgroundColor: "{colors.ring}"
    height: 16px
    width: 8px
  input-field:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 12px
  list-item:
    backgroundColor: transparent
    rounded: "{rounded.md}"
    padding: 8px 12px
  list-item-selected:
    backgroundColor: "{colors.selection}"
  tab-pill-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    height: 32px
    padding: 0 16px
  tab-pill-inactive:
    backgroundColor: transparent
    textColor: "{colors.secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    height: 32px
    padding: 0 16px
---

## Brand & Style

**Inkwell** is the visual identity for AI Application Support, a desktop
workbench for job hunting: tracking applications, building a profile, and
writing cover letters with an AI collaborator.

The metaphor is a writer's desk at night. Job hunting is document craft done
under emotional pressure — the UI should feel like a calm, well-lit desk, not a
monitoring dashboard. Warm charcoal tones stand in for dark paper, text is warm
ink rather than pure white, and the single ink-teal accent behaves like a
fountain pen: used sparingly, for exactly one important action at a time. The
emotional register is focused, trustworthy, and editorial — quiet confidence
that reduces anxiety instead of adding urgency.

The AI assistant is not a chat toy: it is a writing collaborator. Its output
renders as a serif **document bubble** — a surface well with a hairline border,
serif type in a readable column — so every reply is clearly containerized.
Machine-readouts (token estimates, timestamps) are set in monospace, like
instrument dials on the desk.

## Colors

The palette is warm throughout. Every neutral carries a faint brown undertone —
there is no cool gray, no blue-black, no pure white — so the app reads as
"paper and ink" rather than "tech dashboard". All tokens below are the dark
theme, which is the app's default; the light theme is a paper variant of the
same system (mapping at the end of this section).

- **Background (#14120f):** Warm charcoal paper. The entire app sits on this.
- **Surface (#1e1b17):** Cards and panels, one step lighter than the paper.
- **Surface-alt (#262219):** Input fields and nested wells inside surfaces.
- **Border (#3a352c):** Hairline definition between tonal layers.
- **Foreground (#f2ede4):** Warm ink for primary text.
- **Primary (#34d399):** The single accent — mint ink-teal, luminous enough to
  anchor dark paper. Reserved for the one primary action per screen, selected
  list items, focus rings, and the active tab pill. Text on it is deep
  tea-green (`on-primary` #0d2b22).
- **Secondary (#a8a094):** Warm stone for metadata, inactive pills, captions.
- **Muted (#8a8376):** Placeholders and helper text only.
- **Error (#f87171):** Soft vermilion for destructive actions and failures.
- **Status chips:** Five tinted chips carry the application pipeline. Each is a
  dark tinted well with a light label: Wishlist (neutral stone), Applied (dusty
  blue), Interview (amber), Offer (leaf green), Rejected (vermilion). Status
  colors exist for status and nothing else.

The app lets the user pick a personal accent from a preset palette or a colour
picker. Presets must live on the same warm family as `primary` (bright,
dark-friendly values); the custom picker is free-form but the app computes a
readable foreground automatically.

### Light theme (paper variant)

| Token | Value | Token | Value |
|---|---|---|---|
| background | `#f7f4ef` | foreground | `#1f1b15` |
| surface | `#ffffff` | secondary | `#6b6357` |
| surface-alt | `#f1ede6` | muted | `#948c7e` |
| border | `#e3ddd2` | error | `#b91c1c` |
| primary | `#0f6e5c` | on-primary | `#ffffff` |

Status chips in light: same hue families, light tinted wells with deep labels
(applied `#e7eef9`/`#1d4f91`, interview `#f7eeda`/`#92400e`, offer
`#e7f2ea`/`#166534`, rejected `#fbeae8`/`#b91c1c`, wishlist `#ece7de`/`#57513f`).

## Typography

Three voices, one purpose: UI chrome must stay quiet so the documents can speak.

- **Geist Sans** (variable) is the interface voice — headings, labels, body
  text, forms. Neutral and modern; used at 400/500/600 only.
- **Geist Mono** (variable) is the instrument voice — token estimates,
  timestamps, counts, anything that reports machine state. It signals "this is
  data, not prose".
- **Source Serif 4** (variable) is the document voice — every AI-written
  letter, draft, and review. In chat the assistant's output is set at 15px with
  a 1.6 line height inside a surface bubble (1px hairline border, 8px radius)
  capped at ~75ch, so replies read like compact, clearly separated letters on
  the desk.

Hierarchy: `headline-lg` for the company/tab titles, `headline-md` for section
titles, `headline-sm` for card titles, `body-lg`/`body-md` for running UI text,
`caption` for metadata, `label-md`/`label-sm` (500 weight) for buttons and
chips. Headings use tight tracking; body never does.

## Layout & Spacing

The app is a single desktop window (1200×800) with three distinct modes, each
with its own rhythm but sharing one 4px grid:

- **Track** (Applications): master-detail. A 256px sidebar with search, an
  Active/Archive toggle, and a status filter row; the detail pane is a single
  column of cards (max ~896px). The status pipeline is the visual spine —
  chips, not meters.
- **Write** (Cover Letter Developer): full-page document studio. Messages
  render in a centered column capped at 75ch (≈768px); the composer sits at the
  bottom with a live token readout in mono type.
- **Prepare** (Profile): a single scrolling column (max ~896px) of section
  cards, 16px apart, separated by hairlines.

Spacing is an 8px rhythm over a 4px unit: controls are 32px tall, inputs 36px,
card padding 20px, card gaps 16px, section margins 32px. The app is
information-dense on purpose — a desktop workbench — but never cramped: every
card keeps 20px of breathing room.

## Elevation & Depth

Depth is conveyed by **tonal layering**, not shadows: paper → surface cards →
surface-alt wells, each separated by a 1px `border`. Floating layers (dialogs,
select popovers, dropdowns) step up via a slightly lighter surface and a soft
shadow (`0 4px 16px rgba(0,0,0,0.25)` in dark, `0 4px 16px rgba(31,27,21,0.10)`
in light). Focus is a 2px ring in the primary hue with 50% opacity — never a
glow, never a blur. The active tab pill is flat primary, not a glowing bubble.

## Shapes

The shape language is **editorial**: slightly squared, with softness reserved
for things that should feel tactile. Controls (buttons, inputs, chips) use
8px; cards and dialogs use 12px; pills — status chips, the active tab pill,
the "Latest" jump button — are fully round. 6px exists only for micro
elements. Corners are never mixed within one element, and a 1px border
outlines every container.

## Components

### Buttons
Primary buttons are solid mint with deep tea-green text; hover steps one notch
brighter (`primary-hover`). Ghost and outline buttons are borderless/bordered
quiet text actions. Destructive buttons are solid vermilion with deep
vermilion-ink text. One primary action per screen, maximum.

### Status chips
Full-round pills, 2px/10px padding, 12px medium label. Used for the five
application statuses, in the sidebar list, the detail header, and filters. The
chip's tinted well + light label keeps status readable at a glance in both
themes.

### Cards
`surface` background, 1px border, 12px radius, 20px padding. Cards hold one
logical unit of data; related units sit 16px apart. Card titles use
`headline-sm`.

### Chat
User messages are compact primary bubbles (8px radius). Assistant messages are
**document bubbles**: surface background, 1px hairline border, serif type at
15px/1.6, capped at 75ch — one reply per bubble, so where a message starts and
ends is always clear. The action rail (regenerate, copy, save, de-slop,
review, improve) sits beside each assistant message as quiet icon buttons that
surface on hover. A blinking cursor marks live streaming; pipeline steps
("Reviewing draft…") are shown as muted inline progress, never as a
spinner-only void. Streaming and improve-preview replies use the same bubble
treatment.

### Inputs
36px fields on `surface-alt` with 1px borders; textareas share the treatment.
Placeholder text is muted. Focus shows the primary ring.

### List items
Sidebar application rows are transparent until hover; the selected row fills
with a mint-tinted well (`selection`) and a 1px primary border. Rows expose a
destructive affordance (trash) on hover only.

### Tab pill
The active tab is a full-round primary pill with on-primary text; inactive
tabs are transparent with secondary text, gaining a hover tint. Arrow-key
navigation moves between tabs.

## Do's and Don'ts

- Do use the primary accent for exactly one primary action per screen
- Do render AI output as serif document bubbles — surface well, hairline border, one reply per bubble
- Do keep machine readouts (tokens, timestamps) in Geist Mono
- Do use status colours exclusively for application status
- Don't use cool grays or pure white/black — the palette is warm by contract
- Don't add shadows to cards — define layers with surfaces and 1px borders
- Don't use more than two UI weights (400/600, plus 500 for labels) per view
- Don't mix corner radii within a single element; pills are only for chips,
  the tab pill, and small jump buttons
- Do maintain WCAG AA contrast (4.5:1 for normal text) against `background`
  and `surface` at all times
- Don't place the accent on large surfaces — it is an instrument, not a wall