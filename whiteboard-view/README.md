# Whiteboard

A whiteboard custom block for Notion: sticky notes grouped into frames by any
select, multi-select or relation of your database, plus a pen, lines and
arrows. Built on the Notion cookbook whiteboard
(`notion-cookbook/workers/templates/custom-blocks/whiteboard`), with the same
toolbar, filter bar and settings panel as the other blocks in this repo.

**The database stays simple.** Each note is a row with its text and an `X`/`Y`
position. Everything else is local to each viewer's browser: note colors,
stacking order, and all pen strokes, lines and arrows. Share them along with
the view code (see below) when others should see them too.

**One place for setup.** *Settings → From the database* picks which of your
properties the board uses, each guessed automatically from names and types
and each with *None*:

- **Group by**: a select, multi-select or relation (the frames).
- **Written by**: a people property, Created by or Last edited by.
- **Done**: a checkbox.
- **How it was fixed**: a text property.

*On this board* holds the look and layout.

- **Frames from a property.** *Group by* picks a select, multi-select or
  relation (the first one by default, or *No frames*). Every
  option (or linked page) becomes a colored frame. Dropping a note into a
  frame sets that value in Notion, and dropping it outside clears it. A
  multi-select or relation note sits in its first frame, and moving it only
  swaps that value. Frames grow with their notes. Each frame has **+** (add a
  note) and **tidy** (line the notes up in two columns). *Hide empty frames*
  and *Color notes by group* are in the settings too.
- **Frames size themselves** to their notes plus one free row for more.
  Drag a frame's corner to resize it (widths snap to whole note columns);
  double-click the corner to fit the notes again. Sizes are local, like
  colors.
- **Fits the block.** By default the whole board is shown at the
  block's width (up to 640px tall, never below 50% zoom; taller boards
  scroll), re-fitting when the block resizes. Frames widen as they fill.
  Drag the handle under the board to set a height; double-click it to fit
  again. A fixed number of frames per row is in the settings.
- **Filters reshape the board.** While a filter is on, only matching notes
  count: they pack into their frames from the top, frames without matches are
  hidden, and the board shrinks to fit. Hidden done notes never take space.
- **Title.** Click the block's title to rename it. It's saved with the view.
- **Positions that survive regrouping.** Notes store their position relative
  to their frame. Notes without a position, or whose position no longer fits
  (for example after switching the grouping), are laid out in the frame's
  next free slot. Loose notes line up below the frames.
- **Who wrote it.** Every note shows a name tag from *Written by*. The
  automatic pick is a people property named like Author, Owner or Written
  by, then any people property, then Created by. The block fills a people
  property with you for new notes, so it's the better choice: Created by
  may not resolve to a name for notes made in the block. People Notion
  can't name get no tag.
- **Done, with a fix note.** The round check on a note asks *How was it
  fixed?*, prefilled with the note's `How it was fixed` text so it can be
  edited. Press **Done** (or ⌘/Ctrl+Enter) for a full-screen celebration in
  ecosio blue with confetti and a dancing pixel turtle. Then the note flies
  into the mouth of the **turtle in the blue hoodie** in the corner. Click
  the turtle to show done notes again (faded, with the fix underneath). `D`
  checks off the selected note, and the toast has Undo.
- **Filters** cover every property except the positions. Drawings are never
  filtered.
- **Share view.** The share button in the top bar turns the view (grouping,
  filters, look, settings), plus optionally your drawings and note colors,
  into a code. Anyone who pastes it into a whiteboard block gets the same
  board. Property ids are matched by name, so the code also works on a copy
  of the database.
- **Looks.** Whiteboard (an aluminium-framed board with a glossy sheen and
  ghosts of old marker) or Cork board (pinned notes on cork in a wooden
  frame). Both follow Notion's light and dark themes. Text is set in Manrope
  (the ecosio typeface), bundled with the block (`src/fonts`, SIL OFL).

Pan by dragging the empty board, with the hand tool, with Space-drag or with
the trackpad. Zoom with Ctrl/⌘ + scroll or the controls (`0` fits everything).
Shortcuts:

- `V` select, `H` pan, `S` sticky, `P` pen, `L` line, `A` arrow, `E` eraser
- `Enter` edit, `Delete` remove, arrow keys nudge, `Esc` back to select

## Database

**Notes** (`items`, required): one row per sticky note.

| Property           | Type      | Meaning                                                            |
| ------------------ | --------- | ------------------------------------------------------------------ |
| `Title`            | title     | The note's text                                                    |
| `X`, `Y`           | number    | Position; relative to the note's frame when it sits in one         |
| `Author`           | people    | Optional (*Written by*): who wrote it                              |
| `Done`             | checkbox  | Optional (*Done*): checked-off notes are eaten by the turtle       |
| `How it was fixed` | rich_text | Optional (*How it was fixed*): asked for when a note is checked off |

Only Title, X and Y are required. The optional ones can have any name; pick
them in the settings. Nothing else is written.

## Develop

```zsh
npm install
npm run check && npm test
cd blocks/whiteboard-view && npx vite   # open /?mock=1 (theme=dark, scenario=empty|loading|unbound)
ntn workers customblocks dev             # the mock Notion host
ntn workers deploy --name whiteboard-view
```

Code:

- `board.ts`: the pure model (grouping, frames, placement, the local layer)
- `WhiteboardView.tsx`: canvas, tools, optimistic edits, fix note, party
- `Turtle.tsx`: the pixel turtle
- `Tools.tsx` and `geometry.ts`: from the cookbook
- `board.css`
- `src/kit/`: shared UI kit copy
