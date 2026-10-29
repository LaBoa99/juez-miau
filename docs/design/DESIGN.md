---
name: Algorithmic Judge UI
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daea'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eefe'
  surface-container-high: '#e2e8f8'
  surface-container-highest: '#dce2f3'
  on-surface: '#151c27'
  on-surface-variant: '#45464c'
  inverse-surface: '#2a313d'
  inverse-on-surface: '#ebf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#575e70'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#141b2b'
  on-primary-container: '#7d8497'
  inverse-primary: '#c0c6db'
  secondary: '#006c4a'
  on-secondary: '#ffffff'
  secondary-container: '#82f5c1'
  on-secondary-container: '#00714e'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#261906'
  on-tertiary-container: '#968065'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce2f7'
  primary-fixed-dim: '#c0c6db'
  on-primary-fixed: '#141b2b'
  on-primary-fixed-variant: '#404758'
  secondary-fixed: '#85f8c4'
  secondary-fixed-dim: '#68dba9'
  on-secondary-fixed: '#002114'
  on-secondary-fixed-variant: '#005137'
  tertiary-fixed: '#f9debf'
  tertiary-fixed-dim: '#dcc2a4'
  on-tertiary-fixed: '#261906'
  on-tertiary-fixed-variant: '#55442d'
  background: '#f9f9ff'
  on-background: '#151c27'
  surface-variant: '#dce2f3'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: '700'
    lineHeight: 2.25rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.375rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1rem
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '600'
    lineHeight: 1rem
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: 0em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-compact: 0.5rem
  margin: 1rem
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.375rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system is engineered for competitive programming environments, online judges, and technical contest platforms. The core ethos is uncompromising utility, extreme information density, and functional neutrality. Visual ornamentation, decorative gradients, skeuomorphic depth, and ambient shadows are discarded in favor of structural clarity, precise borders, and immediate scannability.

The audience consists of competitive programmers, algorithmic researchers, and academic contest adjudicators who require low-latency interfaces that prioritize data throughput: problem statements, code editors, compiler diagnostics, verdict queues, and test case matrices. The emotional tone is authoritative, focused, and distraction-free.

## Colors

The palette is rooted in strict monochromatic contrast with precise semantic status colors for judging execution verdicts:

- **Canvas & Surface**: Pure White (`#FFFFFF`) serves as the base application background. Secondary structural panels, table headers, sidebar modules, and code snippet containers utilize Neutral Muted (`#F9FAFB`).
- **Typography & Structure**: Primary text, strong headings, and high-emphasis elements use Deep Gray (`#111827`). Secondary information, parameter labels, and metadata use Muted Neutral (`#6B7280`). Structural lines and compartmental boundaries strictly use a crisp 1px solid border in Border Gray (`#E5E7EB`).
- **Semantic Verdicts**:
  - **Success / Accepted (AC)**: Emerald (`#059669`). Used for accepted submissions, passed assertions, and active contest statuses.
  - **Error / Rejected (WA, TLE, MLE, CE, RE)**: Crimson (`#DC2626`). Used for test case failures, compilation errors, runtime exceptions, and memory overflows.
  - **Warning / Pending / Testing (Queue, In-Progress)**: Amber (`#D97706`). Used for pending submissions, evaluation pauses, and non-fatal warnings.

## Typography

Typography prioritizes tabular alignment, computational legibility, and high visual density:

- **Primary Sans-Serif (`Inter`)**: Deployed for problem text, navigation, tabular data, and UI controls. Tight letter tracking and disciplined line-height ratios preserve spatial efficiency while preventing ocular fatigue during prolonged programming contests.
- **Monospace Stack (`JetBrains Mono`, system monospace)**: Deployed for input/output specifications, runtime logs, compiler stderr outputs, source code reviews, and memory usage figures. Numbers are tabular to guarantee strict alignment across submission queues.

## Layout & Spacing

Layouts use a structured, high-density fluid grid that maximizes usable screen real estate. The desktop arrangement operates primarily on a multi-pane split layout: problem description on the left pane and code editor/submission status on the right pane.

- **Grid Model**: 12-column layout with a compact `0.75rem` (12px) gutter.
- **Form Factors**:
  - **Desktop (>= 1024px)**: Dual or triple workbench layouts. Side-by-side split screens for code submission and live judging telemetry.
  - **Tablet (768px - 1023px)**: Collapsible sidebar menus; problem description and solution pane stacked with toggleable tabs.
  - **Mobile (< 768px)**: Single column with persistent status banners, reduced gutter sizes (8px), and horizotally scrollable tabular data.

## Elevation & Depth

This design system eliminates drop shadows, ambient blurs, and pseudo-3D extrusion entirely (`box-shadow: none`). Depth and visual hierarchy are maintained through two precise mechanisms:

1. **Boundary Outlines**: Crisp 1px solid borders (`#E5E7EB`) define all panel boundaries, modal dialogs, and component surfaces.
2. **Surface Alternation**: Visual nesting is achieved by placing neutral tinted backgrounds (`#F9FAFB`) inside pure white canvases (`#FFFFFF`) or vice versa. Focus layers and overlays use flat semi-opaque backdrops (`rgba(17, 24, 39, 0.4)`) combined with stark, non-shadowed white modal frames with 1px dark borders.

## Shapes

The shape system adopts a minimal soft curvature (`roundedness: 1`), providing an architectural, developer-centric feel.

- **Controls & Chips**: Uniform `4px` (`0.25rem`) border radius on buttons, inputs, selects, and verdict badges.
- **Containers & Panels**: `4px` corner radii for code blocks, terminal boxes, and cards.
- **Tables**: `4px` exterior container wrapping with sharp internal column/row separations.

## Components

### Buttons
- **Primary**: Solid `#111827` background, `#FFFFFF` text, `4px` border radius, zero shadow. Hover state shifts to `#1F2937`; active state `#030712`.
- **Secondary / Outline**: `#FFFFFF` background, `#111827` border (1px solid `#E5E7EB`), text `#111827`. Hover shifts background to `#F9FAFB`.
- **Semantic Action Buttons**:
  - Re-Judge / Run: Solid `#059669` background with white text.
  - Abort / Kill Process: Solid `#DC2626` background with white text.
  - Pause Queue: Solid `#D97706` background with white text.
- **Sizes**: Dense sizing with padding `0.25rem 0.625rem` for compact tables, and `0.375rem 0.875rem` for top-level actions.

### Form Inputs & Controls
- **Text Inputs & Textareas**: `#FFFFFF` background with 1px solid `#E5E7EB` border. Focus state switches to a 1px solid `#111827` outline with zero glowing spread. Height is kept compact (32px default).
- **Select Dropdowns**: Native browser styling styled with 1px `#E5E7EB` border, compact padding, and monospace option displays for compiler selection (e.g., `GNU G++20 13.2`, `Python 3.11.4`, `OpenJDK 21`).
- **Checkboxes & Radios**: Native geometric sizing (14px), tinted with `#111827`.

### Tables (Submissions & Standings)
- Border: Outer enclosure 1px solid `#E5E7EB`, horizontal dividing lines 1px solid `#E5E7EB`.
- Header: `#F9FAFB` background, uppercase `0.6875rem` text in `#6B7280`, font-weight 600, padding `0.375rem 0.5rem`.
- Cells: Vertical padding `0.375rem 0.5rem`. Monospace numbers for rank, runtime (e.g., `42 ms`), and memory (e.g., `2048 KB`). Row hover utilizes `#F9FAFB`.

### Verdict Badges
- Compact inline badges (`4px` radius, padding `0.125rem 0.375rem`, font size `0.75rem`, font-weight 600, JetBrains Mono font).
- **Accepted (AC)**: Light background `#ECFDF5`, text and border `#059669`.
- **Wrong Answer (WA) / Compilation Error (CE)**: Light background `#FEF2F2`, text and border `#DC2626`.
- **Time Limit Exceeded (TLE) / Memory Limit (MLE)**: Light background `#FFFBEB`, text and border `#D97706`.
- **Running / In Queue**: Light background `#F3F4F6`, text and border `#4B5563`.

### Code & Diagnostic Blocks
- Background `#F9FAFB` with 1px solid `#E5E7EB` border.
- Monospace font (`JetBrains Mono`, 13px), line numbering in `#9CA3AF`, selection highlight with pure monochrome inverted contrast.