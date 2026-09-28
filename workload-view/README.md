# Workload

A workload chart as a Notion custom block. It shows how much work a person
(or a team, machine, room, anything) has on any day, when several projects
run at the same time. The load grows where assignments overlap and shrinks
when they end, and each lane is compared with its capacity.

It shares its UI with the [Impactt block](../impactt-view): the same
Notion-style filter bar, settings panel and light/dark palette.

## What it shows

- **One lane per person** (or per value of any property you group by).
  Its bars are the average load per day in each period, stacked and colored
  by project.
- **Capacity line** (dashed). Periods above it are tinted red, and the lane
  header shows how much of the capacity is used and the peak.
- **Assignments** under each lane, packed into rows so overlaps are visible.
  Hover a bar to see the dates and daily effort.
- **Tooltip:** hover a period to see the load per project against the
  capacity.

## Set up the database

**Assignments** has one row per piece of work for someone over a period.

| Property | Type                   | Meaning                                                    |
| -------- | ---------------------- | ---------------------------------------------------------- |
| Name     | title                  | What the work is                                           |
| Who      | people                 | Whose load it is. The block can group by any property.    |
| Dates    | date (range)           | When the work happens. A single date is one day.          |
| Effort   | number                 | A % allocation, or hours. See "Effort is" below.           |
| Project  | select (optional)      | Colors the load. Any select, relation or people works.    |

An assignment for several people splits its effort equally between them.

**People** (optional) gives everyone their own working time. Without it,
or for anyone without a row, the default applies (8 h a day, or 100%).

| Property       | Type   | Meaning                                                      |
| -------------- | ------ | ------------------------------------------------------------ |
| Name           | title  | The person's name (matches lanes by name when not by Person) |
| Person         | people | The Notion user, matched with Who                            |
| Hours per week | number | e.g. 40, 32 or 20                                            |
| Workload %     | number | Share of a full-time week, e.g. 80 (or 0.8)                  |

A part-timer's capacity line sits lower. In % mode, someone with 32 h of a
40 h week has 80% to give, and a 50% assignment plus a 40% one puts them
over.

### Percent allocations, no hours needed

If your team plans in percentages ("Ada is 50% on Checkout until
November"), put the % in the Effort column. A column named with %,
"Allocation", "FTE" or "Workload" switches the block to **% allocation**
automatically, and Notion's percent format (0.5) works too. Everything is
then shown in % of each person's time, with no hour maths. The sample data
has an "Allocation %" column to try it.

## Settings (sliders icon)

- **Group by:** people, a select, a relation, a status or text. For
  example, one lane per person, per team or per machine.
- **Color by:** any other of those properties, or none.
- **Effort** and **Effort is**:
  - _% allocation_: 50 means half of someone's time. No hours involved.
  - _Hours in total_: 40 means 40 h spread evenly over the assignment's days.
  - _Hours per day_: 4 means 4 h every day while it runs.
- **Default hours per day** (8), used for anyone not in People.
- **Workdays only:** weekends carry no load or capacity.
- **Time scale** (days, weeks, months), **From/To** dates, and **Show
  assignments**.

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
