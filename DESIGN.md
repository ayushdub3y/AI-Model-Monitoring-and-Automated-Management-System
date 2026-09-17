---
name: Autonomous Model Intelligence
colors:
  surface: '#0f131d'
  surface-dim: '#0f131d'
  surface-bright: '#353944'
  surface-container-lowest: '#0a0e18'
  surface-container-low: '#171b26'
  surface-container: '#1c1f2a'
  surface-container-high: '#262a35'
  surface-container-highest: '#313540'
  on-surface: '#dfe2f1'
  on-surface-variant: '#c7c4d7'
  inverse-surface: '#dfe2f1'
  inverse-on-surface: '#2c303b'
  outline: '#908fa0'
  outline-variant: '#464554'
  surface-tint: '#c0c1ff'
  primary: '#c0c1ff'
  on-primary: '#1000a9'
  primary-container: '#8083ff'
  on-primary-container: '#0d0096'
  inverse-primary: '#494bd6'
  secondary: '#bdc2ff'
  on-secondary: '#131e8c'
  secondary-container: '#2f3aa3'
  on-secondary-container: '#a8afff'
  tertiary: '#4cd7f6'
  on-tertiary: '#003640'
  tertiary-container: '#009eb9'
  on-tertiary-container: '#002f38'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#e0e0ff'
  secondary-fixed-dim: '#bdc2ff'
  on-secondary-fixed: '#000767'
  on-secondary-fixed-variant: '#2f3aa3'
  tertiary-fixed: '#acedff'
  tertiary-fixed-dim: '#4cd7f6'
  on-tertiary-fixed: '#001f26'
  on-tertiary-fixed-variant: '#004e5c'
  background: '#0f131d'
  on-background: '#dfe2f1'
  surface-variant: '#313540'
typography:
  display-lg:
    fontFamily: inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: inter
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-md:
    fontFamily: inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  body-sm:
    fontFamily: inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: '0'
  label-mono-lg:
    fontFamily: jetbrainsMono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
  label-mono-md:
    fontFamily: jetbrainsMono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: '0'
  label-mono-sm:
    fontFamily: jetbrainsMono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  space-xxs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
  space-3xl: 3rem
  gutter-dense: 0.75rem
  gutter-normal: 1rem
  margin-screen: 1.5rem
---

## Brand & Style

This design system targets machine learning engineers, MLOps specialists, and infrastructure architects overseeing production AI/ML deployments. The emotional posture is calm, vigilant, precise, and authoritative—engineered to instill absolute operational confidence amidst complex, high-throughput autonomous systems.

The visual style combines **Corporate High-Density Infrastructure** with **Technical Precision Minimalism**:
- Uncluttered, purpose-driven surfaces where color strictly functions as telemetry and operational signal.
- Dark-first architecture reduces eye strain during prolonged monitoring and deep incident remediation.
- Restrained visual artifacts: no gratuitous gradients or decorative noise. Focus is directed toward data density, operational health, model telemetry, and actionable telemetry traces.

## Colors

The palette establishes a strict operational hierarchy centered on dark, light-absorbent foundations and razor-sharp signal colors.

### Base Hierarchy
- **Canvas Base (`#0B0F19`)**: Deep slate foundation for main viewports and global app background.
- **Panel Base (`#111827`)**: Structural sidebars, navigation bars, and docked analytical drawers.
- **Card Base (`#1E293B`)**: Content containers, data tables, metrics panels, and active execution cards.

### Brand Accents
- **Primary Indigo (`#6366F1`)**: Primary CTAs, active pipeline selections, focus outlines, and primary system metrics.
- **Secondary Violet (`#818CF8`)**: Subtle accents, link states, hover highlights, and active telemetry markers.

### Telemetry & Health States
Color must never be purely decorative; it communicates real-time model stability:
- **Healthy (`#10B981`)**: Model convergence, drift thresholds nominal, zero-degradation pipeline states.
- **Warning (`#F59E0B`)**: Early statistical drift, memory spikes, latency threshold approaches.
- **Critical (`#EF4444`)**: Model degradation, service halt, inference failure, autonomous fallback triggered.
- **Informational (`#06B6D4`)**: Routine scheduled retraining, checkpoint creation, dynamic cluster scaling.

### Typography Contrast
- **Primary Text (`#F8FAFC`)**: High-contrast, crystal-clear readability for values, titles, and critical stats.
- **Muted Text (`#94A3B8`)**: Labels, metadata, units, and timestamps.

## Typography

The type system separates human language from machine telemetry:
- **Inter** is designated for layout structures, page headers, standard UI navigation, and informational reading flows. It offers neutral, unembellished clarity across dense tabular grids.
- **JetBrains Mono** is enforced for technical data: Model hashes, UUIDs, Run IDs, version strings (`v2.4.1-rc3`), latency figures (`18.4ms`), floating point weights, and live pipeline terminal output.

Numbers and technical metrics must maintain tabular lining (`font-variant-numeric: tabular-nums`) to prevent horizontal jitter during real-time data streaming.

## Layout & Spacing

The layout is built on a high-density, **Fluid Multi-Pane Grid** system configured for screen real estate efficiency on multi-monitor infrastructure consoles.

### Grid & Density Principles
- Content conforms to dynamic viewport widths with a 12-column sub-grid, collapsing to 8 columns on tablet viewports and 4 columns on mobile diagnostic views.
- **Standard Gutters**: 16px (`space-lg`) on top-level dashboard overviews; 12px (`gutter-dense`) within dense analytics grids, pipeline logs, and parameter matrix views.
- Margins scale from 16px on mobile viewports up to 24px (`margin-screen`) on desktop monitors.

### Breakpoints & Reflow
- **Desktop (>1280px)**: Persistent collapsible vertical navigation (240px or 64px icon-rail), multi-column telemetry cards, side-by-side terminal/inspector panes.
- **Tablet (768px - 1279px)**: Top-level metrics aggregate into 2-column or 3-column rows; secondary inspectors collapse into overlay drawers.
- **Mobile (<767px)**: High-priority incident-response view; graphs reduce to trendline sparklines; single-column cards with expandable parameter accordions.

## Elevation & Depth

Visual hierarchy is established strictly via **Tonal Stacking and Low-Contrast Structural Outlines**, eschewing heavy dropped shadows for tight visual discipline.

### Tonal Stratification
- **Ground (Level 0)**: `#0B0F19` canvas backing.
- **Mid-Tier (Level 1)**: `#111827` for structural toolbars, secondary sidebars, and grouped zones.
- **Surface (Level 2)**: `#1E293B` for standalone metrics cards, data tables, and run logs.
- **Overlay (Level 3)**: `#1E293B` lifted with a faint ambient glow for active flyout modals, context menus, and telemetry tooltips.

### Outlines & Edge Definition
Every elevated card and panel is bounded by a crisp 1px border (`#1E293B` to `#334155`). The border provides immediate separation between adjacent dense data cells without needing spatial margin buffers.

### Glow Affordances for Operational State
Shadows are substituted by faint, focused perimeter glows (1px to 3px spread, 15–25% alpha) strictly reserved for real-time states:
- **Critical State**: Subtle `#EF4444` ambient perimeter wash.
- **Warning State**: Restrained `#F59E0B` edge luminescence.
- **Active Inspection / Focused Cell**: Precise `#6366F1` stroke with 2px outer glow.

## Shapes

The design system maintains a **Soft Architectural Shape Profile** (`roundedness: 1`). Corners communicate structural stability and high industrial precision.

- **Base Radius (0.25rem / 4px)**: Default for input fields, buttons, data table cells, chips, and run status indicators.
- **Container Radius (0.5rem / 8px)**: Reserved for top-level cards, visual graph containers, modal windows, and terminal consoles.
- **Sharp Edge (0px)**: Applied to continuous timeline graphs, docked data tables, and split code/log viewer panels to maintain an uninterrupted continuous technical grid.

## Components

### Buttons
- **Primary**: Solid `#6366F1` background, `#F8FAFC` label, 4px corner radius, standard 32px height for high density (36px max for hero actions). Hover: `#4F46E5`. Active: `#4338CA`.
- **Secondary / Outline**: 1px `#334155` border, transparent background, `#F8FAFC` label. Hover: `#1E293B` surface background with `#818CF8` border.
- **Destructive**: 1px `#EF4444` border with 10% red background tint, `#EF4444` text. Used for emergency model rollback, endpoint isolation, or service shutdown.

### Chips & Status Indicators
- **Health Indicators**: Compact, 20px-high inline badges with a 6px status dot and JetBrains Mono text. Background uses 10% opacity of the semantic color with a 1px border of 25% opacity:
  - Healthy: `#10B981` border/dot on dark emerald tint.
  - Degraded/Warning: `#F59E0B` border/dot on dark amber tint.
  - Failure/Critical: `#EF4444` border/dot with gentle 4px pulse animation on incident alert screens.
- **Meta Chips**: Neutral `#1E293B` filled badges for framework types (`PyTorch`, `TensorFlow`, `vLLM`), cluster node targets, and quantization formats (`FP8`, `INT4`).

### Input Fields & Selectors
- Background: `#0B0F19` with a persistent 1px border (`#334155`).
- Font: Inter 13px for general inputs; JetBrains Mono 12px for hyperparameter inputs, regex queries, and inference prompts.
- Focus state: Outline switches to `#6366F1` with a 0 0 0 1px `#6366F1` ring. No bulky multi-pixel focus rings.

### Cards & Panels
- **Telemetry Cards**: Surface `#1E293B`, bordered with `#334155`. Card headers feature small JetBrains Mono breadcrumb tracking, primary metric displayed in 24px Inter, and embedded mini sparkline with zero inner card margins.
- **Log Stream & Terminal**: Surface `#0B0F19` recessed inside card; `#94A3B8` monospace text, highlighted log levels (INF in Cyan, WRN in Amber, ERR in Red).

### Checkboxes & Switches
- **Checkboxes**: 14x14px squares with 2px radius, 1px `#334155` border, checking filled with `#6366F1`.
- **Toggle Switches**: Compact 28x16px track with a 12px sliding thumb. Used for autonomous failover toggles, auto-healing activation, and canary traffic split automation.

### Specialized AI/ML Operations Components
- **Model Drift Radar / Gauge**: Segmented circular or horizontal threshold bars dividing safe, warning, and retraining triggers using strict status tokens.
- **Pipeline Stage Nodes**: Modular graph nodes representing inference pipelines (Ingest -> Vector Embed -> Rerank -> LLM Generation) featuring status-tinted borders and real-time step latency readouts in JetBrains Mono.