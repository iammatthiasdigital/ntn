# Workload

A workload chart as a Notion custom block. It shows how much a person has
on any day: how many tasks run at once, or how much effort. The load grows
where tasks overlap and shrinks when they end.

It shares its UI with the [Impactt block](../impactt-view): the same
Notion-style filter bar, settings panel and light/dark palette.

## What it shows

- **One lane per person**, optionally grouped under headings (*Group by*).
  Bars show the load per period. With effort, a dashed capacity line is
  drawn and periods over capacity are tinted red.
- **Tasks** under each lane, labelled with the properties picked in *Bar
  label* (Title by default, e.g. "Checkout API · Backend · In progress").
  Tasks without a date are left out (the footer counts them); *Tasks
  without a date* in the settings shows them as ongoing instead.

## Settings

Any database works: the properties are picked in the block's **settings**,
not when connecting it, and are guessed from names and types to start with.

| Setting    | Property type                        | Meaning                                                                  |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Person     | people, or relation to person pages  | Whose task it is                                                         |
| Dates      | date                                 | Tasks without one are left out (or shown as ongoing, see settings)       |
| Group by   | select, multi-select, status, relation | Optional headings. On the tasks, a person shows in each group they have tasks in; on People, in their own |
| Bar label  | any (at least one)                   | What the task bars say                                                   |
| Measure    |                                      | **Task count** (default), or effort (below)                              |
| Effort     | number                               | Only when measuring effort                                               |

**Measure**:

- **Task count**: how many tasks run at once. No effort property needed.
- **Effort, spread over the task**: effort ÷ the task's days, workdays only
  when *Workdays only* is on (40 h over two weeks = 4 h a day).
- **Effort per day**: hours every day while it runs.
- **Effort as % of full time**: 50 = half of someone's time (Notion's
  percent format works).

**From / To** are never empty: without your own dates, half a year back and
half a year ahead.

**Nothing loads until the filter bar names a project or a person.** Task
databases can be huge, so the block starts with just the schema and asks
for a Project or Person filter (the filter button is highlighted, with a
tooltip). Then it loads only those tasks; every other filter applies on top.

- **A select, status or multi-select of the tasks** (e.g. Project,
  Discipline, a person select): the task query is filtered in Notion
  ("is"/"contains" with one or more values). Over 999 matches are read page
  by page.
- **Projects database** (optional): its projects appear as a *Project*
  filter even before anything is loaded. Picking some loads the tasks their
  relation to the tasks points to, a few at a time (up to 1,500), with
  *Refresh*. Notion can't filter a query by relation or person, so this goes
  through the project instead.
- **People database** with a relation to the tasks: the same as a *Person*
  filter; the picked people then show alone.

*Settings → Projects → tasks / People → tasks* pick the relation (or
*None*). Tasks loaded one by one don't carry formulas, rollups or Created by
(Notion doesn't return them for single pages).

**Task counts** share a 0–20 scale so people can be compared; a lane with
more than 20 tasks at once gets its own scale, marked in red. Effort lanes
share one scale as before. **Task bars** are off by default and locked off
above 1,000 tasks.

**People** (optional database) adds a group column, a working-time column
(hours per week, or %) and people to show. Only people with tasks get a
lane; *People shown* adds others (tick them one by one) or shows everyone.
Rows are matched by relation, by person or by name.

**Working time** (effort only) is 100% unless the People database provides
it. You can also click "works …" on a person to set it locally. It's saved
in the view, so it travels with the share code.

## Development

```zsh
npm install
npm run check
npm test                         # unit tests for the workload model
ntn workers customblocks dev     # Notion mock host at localhost:9873
cd blocks/workload-view && npx vite  # then open /?mock=1 (&theme=dark)
ntn workers deploy --name workload-view
```

`data/worker_assignments.json` holds 12 sample assignments for four people
(with hours and an Allocation % column), and `data/worker_people.json` gives
three of them their own working time.

The `src/kit/` folder is a copy of the shared block UI; this project doesn't
depend on the other ones.

---

Created by Matthias ([matthias.digital](https://matthias.digital)).
