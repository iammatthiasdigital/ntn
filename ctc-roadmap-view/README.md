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
plan. In Notion, insert the custom block into a page, map its `features`
data source to the Features database, and map `products` to the database
the Product relation points to. The block shows the sample 2026 mandate
roadmap and a setup hint until the data sources are bound.

## Databases

Two data sources. `features` ("Features") is the board's rows:

| Property  | Type         | Meaning                                              |
| --------- | ------------ | ---------------------------------------------------- |
| `name`    | title        | Feature name (fallback for the country)              |
| `tags`    | multi_select | Board keeps rows with a `mandate` tag (any case)     |
| `product` | relation     | Board keeps `Compliance transaction(s)` (any case)   |
| `eta`     | date         | The quarter of this date decides the kanban column   |
| `country` | rich_text    | ISO 3166-1 alpha-2 code (`FR`) or full name (France) |
| `scopes`  | multi_select | Mandate scopes, e.g. `B2B`, `B2G`, `B2C`             |

`products` ("Products") is the database the Product relation points to,
with just a title (`name`). The block reads product names from it to apply
the product filter; relation ids it doesn't cover fall back to one
`pages.get` per distinct product page.

Notes on tolerance:

- The product match is case-insensitive and accepts singular and plural
  ("Compliance transaction" / "Compliance Transactions"). Plain select or
  text values work too if `product` is ever bound to one.
- Rows whose Product relation cannot be read are counted in a footnote,
  never silently dropped; an unmapped `tags`/`product` slot switches that
  filter off (also noted in the footnote).
- `eta` also accepts text spellings like `Q3 2026` or `2026-Q3` when bound
  to a text property.
- The country resolves via `Intl.DisplayNames` plus an alias table
  (USA, UAE, UK, Turkey/Türkiye, South Korea, …). Messy input survives:
  stray whitespace/NBSPs, rich text split into runs ("K"+"R"), labeled
  codes ("KR - South Korea", "Korea (KR)"). Unresolvable input is displayed
  as typed, and an unresolved country cell falls back to the page title.
- Page icons are used as the card flag when present; otherwise the flag
  emoji is derived from the country code (🌐 when unresolvable).

## Interactions

- **Year picker** above the board: chevrons step through years that have
  scheduled mandates; the dropdown jumps directly.
- The default year is the current year, else the nearest upcoming year with
  data, else the last year with data.
- Quarters whose last day has passed render in green ("delivered"), the
  rest in blue — matching the roadmap slide the block is modeled on.
- **Export PNG** renders the header and board (controls excluded) to a
  2× PNG download named `ctc-roadmap-<year>.png`. Flag images the browser
  can't fetch cross-origin are left blank in the export rather than
  failing it.
- Matching rows without an ETA, rows past the 999-row read limit, and rows
  with unreadable Product relations are counted in footnotes instead of
  being silently dropped.
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
  index.ts       Worker definition and the two data-source schemas
blocks/ctc-roadmap-view/
  src/
    RoadmapBoard.tsx      Header, year picker, PNG export, columns, cards
    roadmap.ts            Filtering, ETA→quarter parsing, bucketing (pure)
    countries.ts          ISO/name → country + flag emoji resolution (pure)
    useNotionFeatures.ts  Real data layer (rows, product relation names,
                          lazy icon resolution)
    mockData.ts           Seeded 2025–2027 mandates for standalone dev
data/
  worker_features.json    Sample rows for the dev shell's Features source
  worker_products.json    Sample rows for the dev shell's Products source
test/
  roadmap.test.ts  Unit tests for the pure logic modules
```

## Limitations

- Rows cap at 999 per data source (the `useDataSource` limit); a footnote
  appears when the cap cuts data off.
- Icon resolution issues one `pages.get` per matching row.
- Country resolution accepts alpha-2 codes and English names; alpha-3
  codes are not resolved (they pass through as typed).
- The dev shell's mock host cannot serve `pages.get` for seeded rows, so
  the products fallback path (relation ids outside the bound Products
  source) only exercises in real Notion.
- PNG export uses the browser's canvas: page-icon flags whose hosts block
  cross-origin reads are left blank in the exported image.
- The year picker state lives in the session; it isn't persisted to the
  block.
