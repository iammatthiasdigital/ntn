# Workload

A workload chart as a Notion custom block. It shows how much work a person
(or a team, machine, room, anything) has on any day, when several projects
run at the same time. The load grows where assignments overlap and shrinks
when they end, and each lane is compared with its capacity.

It shares its UI with the [Impactt block](../impactt-view): the same
Notion-style filter bar, settings panel and light/dark palette.

## What it shows

- **One lane per person**, grouped under team headings. Bars show the
  average workload per period, stacked and colored by project, against a
  dashed capacity line. Periods over capacity are tinted red.
- **Allocations** under each lane. Rows without dates are ongoing and span
  the whole range.

## Databases

**Workload** (required) has one row per allocation. Any database works: the
columns are picked in the block's **settings**, not when connecting it, and
are guessed from names and types to start with.

| Setting  | Column type                          | Meaning                                         |
| -------- | ------------------------------------ | ----------------------------------------------- |
| Person   | people, or relation to person pages  | Whose time it is                                |
| Project  | select or relation                   | What the time goes to (colors the load)         |
| Team     | select or relation                   | Optional: groups people (can also be on People) |
| Workload | number, e.g. 50 or 50%               | Share of full time (or hours, see below)        |
| Dates    | date                                 | Optional: rows without dates are ongoing        |

**People** (optional) lists everyone, also those without allocations. Pick
its team column (select or relation) and a working-time column (hours per
week, or %). Rows are matched to the Workload by relation, by person or by
name.

**Working time** is 100% unless the People database provides it. You can also
click "works …" on a person to set it locally. It's saved in the view, so it
travels with the share code.

**Workload is** % of full time by default (Notion's percent format works).
Hours per day or hours in total are there for later.

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
