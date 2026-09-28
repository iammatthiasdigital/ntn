# ntn

Notion Workers projects, built with `@notionhq/workers` and deployed with
the [`ntn` CLI](https://www.npmjs.com/package/ntn).

## Projects

### [`ctc-roadmap-view/`](./ctc-roadmap-view)

A custom block that renders a CTC (continuous transaction controls)
e-invoicing mandate roadmap in the shared Notion UI:

- a quarterly kanban and a country coverage board over a Features database
- the kit's top bar, filter bar, settings and view sharing
- a year stepper and PNG export

See its [README](./ctc-roadmap-view/README.md).

### [`impactt-view/`](./impactt-view)

The Impactt chart as a custom block: a Gantt chart where each bar's height
is the KPI change an initiative delivers, stacked toward the KPI's goal,
with plan, actual and projected lines. It is fed by three databases
(Initiatives, KPIs, Impacts). A Notion-style filter bar is generated from
the Initiatives database, so every property can be filtered, whatever its
type, including And/Or rules and groups and relative dates. See its
[README](./impactt-view/README.md).

### [`burnup-view/`](./burnup-view)

A simple burn-up / burn-down chart fed by one Items database: scope, done
(or remaining), an ideal line to a target date and a forecast from the
recent velocity. It uses the same filter bar and settings panel as Impactt,
without the Gantt bars. See its [README](./burnup-view/README.md).

### [`workload-view/`](./workload-view)

A workload chart for people (or any grouped item) working on several
things at once. Assignments spread their effort over their dates, overlaps
add up, and each lane is compared with its capacity per day, colored by
project. See its [README](./workload-view/README.md).

### [`office-view/`](./office-view)

Desk and room booking: rooms and places with types (desks, meeting rooms,
phone booths, parking), shown as a floor plan of tiles or a timeline.
People book a place for a time, and bookings, rooms and places are created
as rows in Notion databases. See its [README](./office-view/README.md).

### [`whiteboard-view/`](./whiteboard-view)

A whiteboard (sticky notes, pen, lines, arrows) based on the Notion cookbook
whiteboard. Notes are rows holding only their text and X/Y. Frames come from
any select, multi-select or relation you pick, and colors and drawings stay
local to each viewer. It has author tags and a Done check that asks how it
was fixed, celebrates, and feeds the note to a pixel turtle in an ecosio
hoodie. See its [README](./whiteboard-view/README.md).

### [`orgchart-view/`](./orgchart-view)

An org chart based on the Notion cookbook org chart: starts folded to the
leaders, filters on any People property (hide or fade the rest), and renders
cards from the properties you pick, colored by a select. People with an Exit
date are left out for everyone. See its [README](./orgchart-view/README.md).

## Sharing a view

Filters and view settings are remembered per block in each viewer's browser.
To give others the same view, use the **share** button in the block's top
bar and copy the view code. Whoever
pastes it into the same kind of block gets the same filters and settings.
Property ids are matched by name, so a code also works on a copy of the
database. The code is plain text: send it however you like. Nothing is
uploaded.

## Security and privacy

The blocks are self-contained and make no requests of their own:

- **No third-party requests.** There are no analytics, telemetry, error
  reporting, CDNs or web fonts from third parties. Fonts (Manrope, whiteboard only)
  are bundled with the block. The only traffic is the Notion SDK
  talking to the Notion host page. The ctc-roadmap PNG export reads the
  images already on the board when you click Export.
- **Production bundles carry no mock data.** The `?mock=1` harness is
  compiled out of `vite build` (`__MOCK__`), and Vite's preload polyfill is
  off.
- **Writes only through the SDK**, only to the bound databases, and only on a
  user action. Text inputs that write to Notion have length limits.
- **Untrusted input is validated:**
  - View codes are size-limited, parsed as JSON without prototype keys, and
    merged field by field over the defaults (shape-checked, then clamped by
    each block's `sanitize`).
  - Locally stored drawings are re-validated on load.
  - Remote page icons (ctc-roadmap) must be https and load without a
    referrer.
- **Failures stay inside the block.** An error boundary shows *Try again* and
  *Reset my view* instead of a blank frame, and reports nothing anywhere.
- **Dependencies.** React and the Notion SDK only, plus html-to-image in
  ctc-roadmap. Versions are pinned via lockfiles, and
  `npm audit --omit=dev` is clean.

## Requirements

- Node >= 22, npm >= 10.9.2
- `ntn` CLI (`npm install --global ntn`), logged into the target workspace
- Deploying workers requires that workspace to be on a Business or
  Enterprise plan; local previews via `ntn workers customblocks dev` work
  without one

## Working on a project

```zsh
cd ctc-roadmap-view
npm install
npm run check   # type-check worker + block
npm test        # unit tests
ntn workers customblocks dev   # mock Notion host at localhost:9873
ntn workers deploy --name ctc-roadmap-view
```
