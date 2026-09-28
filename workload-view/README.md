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
  Rows without dates are ongoing and span the whole range.

## Settings

Any database works: the properties are picked in the block's **settings**,
not when connecting it, and are guessed from names and types to start with.

| Setting    | Property type                        | Meaning                                                                  |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Person     | people, or relation to person pages  | Whose task it is                                                         |
| Dates      | date                                 | Optional: rows without dates are ongoing                                 |
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

**Large databases.** Notion gives a block at most 999 rows per query and no
paging. When the database has more, the block reads it one week of From–To
per query (by start date, via the Dates property), plus the latest tasks
that started before From and the tasks without a date, and merges them.
All queries stay live. A week with more than 999 tasks starting in it is
the only thing that can still be cut short (the footer says so).

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
