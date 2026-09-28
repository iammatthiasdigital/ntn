# Office

Desk and room booking as a Notion custom block. Add rooms and places (desks,
meeting rooms, phone booths, parking spots…) with types, and let people
claim a place for the day with one click. Everything is stored in Notion
databases.

It comes dressed as **The Office**, a regional paper-company branch in
ecosio colors:

- navy door plaques for floors
- white folder rooms
- desks with "HELLO my name is" tags (navy for colleagues, blue for you)
- green sticky notes

Each desk's status is its bottom edge: green is free, light blue is part of
the day or up for grabs, gray is booked, and blue is yours. A plain Notion
theme is one click away in the settings.

It shares its UI with the [Impactt block](../impactt-view): the same
Notion-style filter bar, settings panel and light/dark palette.

## What it does

- **Rooms layout:** rooms as cards, grouped by floor, with each place as a
  tile. The tile colour shows the state for the chosen day: free (green),
  partly booked (amber), booked (grey) or yours (blue). On today's date it
  shows the state right now. The tile also shows the next booking and who
  made it.
- **Timeline layout:** one row per place across the opening hours, with
  bookings as bars. Click an empty spot to book from that time.
- **One click claims the day.** Most people sit at one desk all day, so
  clicking a free place books it for the whole day, with an Undo. If you
  already have a desk that day, you're moved to the new one.
- **Your usual spot:** the banner offers the desk you claim most often
  when it's free, or tells you where you sit today.
- **Times when you need them:** the clock button on a tile shows the day's
  bookings and lets you pick a start and end time (meeting rooms, calls).
  Overlaps are blocked.
- **Notes and "up for grabs":** add a note to your booking ("Leaving at 1pm,
  desk is yours after"). It shows as a sticky note on the place. Tick **Up
  for grabs** and others can take the place over: it shows dashed, and a
  one-click claim works on it.
- **Your bookings** lists what's coming, with notes, up-for-grabs and
  cancel.
- **Add rooms and places** with the + button (name, floor, type, room, seats).
- **Filters** on places: for example, Type is Desk and Features contains
  Monitor.
- **Day navigation:** previous/next day, Today, or pick a date.

## Set up the databases

**Places** (required): everything that can be booked.

| Property | Type                 | Meaning                                   |
| -------- | -------------------- | ----------------------------------------- |
| Name     | title                | e.g. "Desk 4", "Atlas"                    |
| Room     | relation → Rooms     | Where it is                               |
| Type     | select               | Desk, Meeting room, Phone booth, Parking… |
| Seats    | number               | How many people fit                       |
| Features | multi-select         | Monitor, Standing desk, Video call…       |

**Bookings** (required): one row per reservation. The block creates them.

| Property | Type               | Meaning                                                  |
| -------- | ------------------ | -------------------------------------------------------- |
| Name     | title              | Set to "Place · Person"                                  |
| Place    | relation → Places  | The booked place                                         |
| Who      | people             | Who booked it                                            |
| When     | date               | A date is the whole day; add times for a slot            |
| Note     | text               | Optional, shown as a sticky note                         |
| Up for grabs | checkbox       | Others can take the place over                           |

**Rooms** (optional): Name, Floor (select) and Type (select). Without it,
places are shown as one group.

## Settings (sliders icon)

- **Theme:** The Office (ecosio colors: blue #0054FF for you and your actions, navy #002268 for headings and plaques, green #6FD44E for free, white and pale blue #F2F6FF for the rest) or Notion.
- **Layout:** rooms or timeline.
- **One click claims the day:** turn off to always open the details first.
- **Opening hours:** bookings are made within them, and availability is
  judged on them.
- **Default booking** length and **Show who booked**.

## Notes

- Times are wall-clock times. New bookings are sent with the booker's
  time zone.
- A place can have one booking at a time, including meeting rooms, unless
  the booking is marked up for grabs.
- Everyone who can edit the Bookings database can book. Only your own
  bookings show a Cancel button in the block; Notion permissions still
  decide who can edit rows.

## Development

```zsh
npm install
npm run check
npm test                         # unit tests for the office model
ntn workers customblocks dev     # Notion mock host at localhost:9873
cd blocks/office-view && npx vite    # then open /?mock=1 (&theme=dark)
ntn workers deploy --name office-view
```

The sample data in `data/` has 5 rooms on three floors, 15 places and a
week of bookings. The `?mock=1` harness moves the bookings to the current
week, and bookings you make there stay in memory.

The `src/kit/` folder is a copy of the shared block UI; this project doesn't
depend on the other ones.

---

Created by Matthias ([matthias.digital](https://matthias.digital)).
