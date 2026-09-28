# Org chart

An org chart custom block for Notion, built on the Notion cookbook org chart
(`notion-cookbook/workers/templates/custom-blocks/org-chart`) with the same
toolbar, filter bar and settings panel as the other blocks in this repo.

- **Starts closed.** Only the leaders show when the chart loads; everyone else
  is folded under their manager. The pill under a card shows the team size;
  click it to open one level. The card you toggle stays still while the chart
  reflows around it. *Settings → On load* can open one, two or all levels.
  **Fold all / Open all** are in the corner.
- **Filters on any property.** The filter bar is generated from the People
  database (Team, Location, Start date, Hiring…, And/Or groups, relative
  dates). People who don't match are **hidden** (matches link up to their
  nearest shown manager with a dashed line, and a small "↑ Name" caption shows
  a hidden direct manager) or **faded** (whole tree kept). A new filter opens
  the chart so every match is visible.
- **Cards rendered from your properties.** *Settings → Card properties* picks
  any properties to show on the cards, each drawn by type (select tags in their
  Notion colors, people, relations, dates, checkboxes, numbers, text). Card
  height follows the number of fields.
- **Color by** a select/status property: a colored top stripe and tint, plus a
  legend; click a legend entry to highlight that group.
- **Find someone** (`/`): search by name or role; picking a match opens the
  teams above them and centers the card. Hover or select a card to light up its
  reporting line.
- **Leavers are out, for everyone.** Anyone with an `Exit date` is left out
  of the chart for every viewer, before any filter applies. Their reports
  move up to the next manager, as if the leaver had never been there. The
  property is found by mapping or by name (a date property named Exit /
  Leaving / Left / Austritt…), and it's kept out of the filter and card menus.
- **Share view**: the share button copies the view (filters, card
  properties, color, on load) as a code others can paste into their org
  chart.

Pan by dragging or scrolling, zoom with Ctrl/⌘ + scroll or the controls
(`0` fits the chart).

## Database

**People** (`people`):

| Property     | Type      | Meaning                                           |
| ------------ | --------- | ------------------------------------------------- |
| `Name`       | title     | The person                                        |
| `Role`       | rich_text | Shown under the name                              |
| `Reports to` | relation  | The manager (relation to the same database)       |
| `Exit date`  | date      | Optional: set means the person has left (hidden)  |
| anything else | any      | Can be shown on cards, used for color, filtered   |

Cycles and pointers to missing rows are broken gracefully (they become extra
roots), as in the cookbook.

## Develop

```zsh
npm install
npm run check && npm test
cd blocks/orgchart-view && npx vite   # open /?mock=1 (theme=dark, scenario=empty|loading|unbound)
ntn workers customblocks dev
ntn workers deploy --name orgchart-view
```

Code: `org.ts` (people, filtering/pruning, open levels), `tree.ts` (tidy-tree
layout from the cookbook, sized by the cards), `OrgView.tsx`, `org.css`,
`src/kit/` (shared UI kit copy).
