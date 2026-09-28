# Burn-up

A simple burn-up and burn-down chart as a Notion custom block. It reads one
database of work items and shows how the scope grows, how much is done, and
when the rest will be finished at the current pace.

It shares its UI with the [Impactt block](../impactt-view): the same
Notion-style filter bar, settings panel and light/dark palette. It has no
Gantt bars, just the burn lines.

## What it shows

- **Scope** (grey step line): everything added so far.
- **Done** (blue): everything finished. In burn-down mode, this line shows
  the **remaining** work instead, falling toward zero.
- **Ideal** (purple, dashed): from the start to the target date. It needs a
  target in the settings.
- **Forecast** (grey, dashed): the average pace over the last few weeks,
  extended until done meets the scope.
- **Stats row:** scope, done (%), remaining, velocity per week (and tickets
  closed this week), and the forecast date. With a target, it also says how
  many weeks late or on time.
- **Vibe check:** one status line in developer-meme style that a PM can read
  too, picked from how the project is doing: shipped ("It works on
  everyone's machine now"), ahead, on track, running late, "This is fine",
  scope creep ("The backlog is breeding"), or stalled ("Have you tried
  turning the sprint off and on again?"). Milestone flags mark 25/50/75%,
  and there's confetti at 100%. It can be turned off in the settings.

### Tickets or estimates

The switch in the toolbar sizes the chart by **Tickets** (every row counts
1) or by **Estimate** (or any other number property). When sizing by
estimate, tickets without one count as the average estimate by default, or
as 1, or as 0 (Settings → Measure). A footnote says how many were guessed.
Without any estimates in the database, the chart simply counts tickets.

### When a ticket joins the scope

By default a ticket joins the scope when it was **created** in Notion, so no
extra property is needed. Settings → Joins the scope can use an **Added**
date property instead, and falls back to the created time where it's empty.

Hover over the chart to see scope, done and remaining on any date.

## Set up the database

**Items** has one row per task, story or ticket. Every other property
(Team, Status, Owner, Type…) can be filtered.

| Property | Type   | Meaning                                                        |
| -------- | ------ | -------------------------------------------------------------- |
| Name     | title  | Item name                                                      |
| Estimate | number | Size (points, hours, €). Optional.                             |
| Added    | date   | Optional. Overrides the created time, if chosen in settings.  |
| Done     | date   | When it was finished. Empty means still open.                  |

## Settings (sliders icon)

- **Chart:** burn-up or burn-down.
- **Measure:** count tickets, or size them by any number property, and how
  tickets without an estimate count.
- **Joins the scope:** created time (default) or the Added property.
- **Time scale:** days, weeks or months.
- **Lines:** show or hide scope, done, ideal and forecast.
- **Start** and **Target** dates, and how many recent periods the velocity
  uses.
- **Table:** lists the items with their dates and size.
- **Vibe check:** the status line, milestone flags and confetti.

## Development

```zsh
npm install
npm run check                    # type-check worker + block
npm test                         # unit tests for the burn model
ntn workers customblocks dev     # Notion mock host at localhost:9873
cd blocks/burnup-view && npx vite   # then open /?mock=1 (&theme=dark)
ntn workers deploy --name burnup-view
```

`data/worker_items.json` holds 28 sample items for the dev shell and the
`?mock=1` harness.

The `src/kit/` folder (filters, settings, toolbar, data hook) is a copy of
the shared block UI; this project doesn't depend on the other ones.

---

Created by Matthias ([matthias.digital](https://matthias.digital)).
