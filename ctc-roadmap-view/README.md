# Worker custom block: CTC roadmap view

**TL;DR:** A quarterly kanban rendered inside a Notion page from a Features
database. It keeps only rows tagged `mandate` for the product
`Compliance transactions` (both case-insensitive) and buckets them into
Q1–Q4 columns by ETA. Cards show the page icon (flag), the resolved country
name, and the mandate scopes. Completed quarters render green, upcoming ones
blue, and a year picker above the board switches years. Typeface: Manrope
(bundled, no CDN).

## Quickstart

From the repository root:

```zsh
npm install --global ntn
cd ctc-roadmap-view
npm install
npm run check
npm test
ntn workers customblocks dev
```

Open http://localhost:9873 to preview the block in the custom blocks dev
shell — a mock Notion host with sample data sources to bind.
`data/worker_features.json` seeds the shell's Features source with the 2026
mandate roadmap (plus decoy rows the filter must drop); edit it and restart
the shell to change the sample data. When it looks right, deploy:

```zsh
ntn login
ntn workers deploy --name ctc-roadmap-view
```

Deploying workers requires the workspace to be on a Business or Enterprise
plan. In Notion, insert the custom block into a page and map its `features`
data source to the Features database. The block shows the sample 2026
mandate roadmap and a setup hint until the data source is bound.

## Database

One data source, semantic key `features` ("Features"):

| Property  | Type         | Meaning                                              |
| --------- | ------------ | ---------------------------------------------------- |
| `name`    | title        | Feature name (fallback for the country)              |
| `tags`    | multi_select | Board keeps rows with a `mandate` tag (any case)     |
| `product` | select       | Board keeps `Compliance transactions` (any case)     |
| `eta`     | date         | The quarter of this date decides the kanban column   |
| `country` | rich_text    | ISO 3166-1 alpha-2 code (`FR`) or full name (France) |
| `scopes`  | multi_select | Mandate scopes, e.g. `B2B`, `B2G`, `B2C`             |

Notes on tolerance:

- `product` also matches when bound to a multi_select that contains
  "Compliance transactions".
- `eta` also accepts text spellings like `Q3 2026` or `2026-Q3` when bound
  to a text property.
- The country resolves via `Intl.DisplayNames` plus an alias table
  (USA, UAE, UK, Turkey/Türkiye, South Korea, …). Unresolvable input is
  displayed as typed. When `country` is unbound or empty, the page title is
  used instead.
- Page icons are used as the card flag when present; otherwise the flag
  emoji is derived from the country code (🌐 when unresolvable).

## Interactions

- **Year picker** above the board: chevrons step through years that have
  scheduled mandates; the dropdown jumps directly.
- The default year is the current year, else the nearest upcoming year with
  data, else the last year with data.
- Quarters whose last day has passed render in green ("delivered"), the
  rest in blue — matching the roadmap slide the block is modeled on.
- Matching rows without an ETA are counted in a footnote instead of being
  silently dropped.
- The board follows the host theme (light/dark) and wraps to two or one
  column(s) at narrow widths.

## Local development

Test the block in the custom blocks dev shell (`ntn workers customblocks
dev`, above). The view also renders standalone with a seeded 2025–2027
roadmap, no Notion host required:

```zsh
cd blocks/ctc-roadmap-view
npx vite
```

Open `http://localhost:5173/?mock=1`. Harness parameters: `theme=dark`,
plus scenario switches for `loading`, `unbound`, and `empty`.

## Project structure

```text
src/
  index.ts       Worker definition and the features data-source schema
blocks/ctc-roadmap-view/
  src/
    RoadmapBoard.tsx      Header, year picker, quarter columns, cards
    roadmap.ts            Filtering, ETA→quarter parsing, bucketing (pure)
    countries.ts          ISO/name → country + flag emoji resolution (pure)
    useNotionFeatures.ts  Real data layer (rows + lazy icon resolution)
    mockData.ts           Seeded 2025–2027 mandates for standalone dev
data/
  worker_features.json    Sample rows for the dev shell's Features source
test/
  roadmap.test.ts  Unit tests for the pure logic modules
```

## Limitations

- Rows cap at 999 (the `useDataSource` limit).
- Icon resolution issues one `pages.get` per matching row.
- Country resolution accepts alpha-2 codes and English names; alpha-3
  codes are not resolved (they pass through as typed).
- The year picker state lives in the session; it isn't persisted to the
  block.
