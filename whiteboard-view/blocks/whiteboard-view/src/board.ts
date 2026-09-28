/**
 * Whiteboard model. Pure: Items rows plus this viewer's local layer in, the
 * board out.
 *
 * The database only holds the notes: their text and X/Y (plus, optionally,
 * Author, Done and "How it was fixed"). Groups come from a property the
 * viewer picks — a select, multi-select or relation — each value becomes a
 * frame, and dropping a note into a frame sets that value. A note in a frame
 * stores its position relative to the frame, so frames can move without
 * scattering their notes; notes without a position are laid out in their
 * frame's next free slot.
 *
 * Everything else — note colors, stacking order, pen strokes, lines and
 * arrows — is local to the viewer (see `LocalLayer`).
 */
import { checkboxOf, numberOf, pointerIds, textOf, type SchemaLike } from "./kit/filters/core"
import { prop, type SourceRow, type SourceSnapshot } from "./kit/sources"

export type ItemType = "sticky" | "stroke" | "line" | "arrow"
export type InkType = Exclude<ItemType, "sticky">
export type Color = "yellow" | "orange" | "pink" | "red" | "purple" | "blue" | "green" | "brown" | "gray"
export type Point = [number, number]

export const COLORS: Color[] = ["yellow", "orange", "pink", "red", "purple", "blue", "green", "brown", "gray"]
export const STICKY_COLORS: Color[] = ["yellow", "orange", "pink", "purple", "blue", "green", "gray"]
export const INK_COLORS: Color[] = ["gray", "blue", "red", "green", "purple"]

export const STICKY = 160
export const FRAME_W = 2 * STICKY + 3 * 20
/** One row of notes in a frame (a note and the gap below it). */
export const ROW = STICKY + 20
export const FRAME_MIN_W = STICKY + 40
export const FRAME_MIN_H = 520
export const FRAME_HEAD = 48
export const FRAME_GAP = 36
export const MARGIN = 28

/** Property types a board can be grouped by. */
export const GROUPABLE = ["select", "multi_select", "relation"] as const
export type GroupKind = (typeof GROUPABLE)[number]

export type Item = {
	id: string
	type: ItemType
	/** Sticky text. */
	title: string
	/** Local color (stickies may show their group's color instead). */
	color: Color
	/** Absolute canvas position (resolved from the frame for grouped stickies). */
	x: number
	y: number
	width: number
	height: number
	/** Points relative to (x, y); empty for stickies. */
	points: Point[]
	strokeWidth: number
	z: number
	/** The frame the sticky is shown in. */
	groupId: string | null
	/** All values of the group property (a multi-select or relation can hold several). */
	groupValues: string[]
	authorIds: string[]
	done: boolean
	/** How it was fixed: asked for when the note is checked off. */
	resolution: string
	/** The X/Y stored in the database (relative to the frame), before layout. */
	sx?: number | null
	sy?: number | null
}

export type Group = {
	/** Option name (select, multi-select) or page id (relation). */
	id: string
	name: string
	color: Color
	/** Frame on the canvas. */
	x: number
	y: number
	w: number
	h: number
	/** Stickies in the frame (not done). */
	count: number
	/** Sized to its notes (no size set by hand). */
	auto: boolean
}

export type Board = {
	items: Item[]
	groups: Group[]
	width: number
	height: number
}

/* ---------- the viewer's local layer ---------- */

export type Ink = { id: string; type: InkType; color: Color; x: number; y: number; width: number; height: number; points: Point[]; strokeWidth: number; z: number }

export type LocalLayer = {
	/** Sticky id → color picked by this viewer. */
	colors: Record<string, Color>
	/** Sticky id → stacking order. */
	z: Record<string, number>
	/** Pen strokes, lines and arrows. */
	ink: Ink[]
	/** Frame sizes set by hand, per group id. */
	frames: Record<string, { w?: number; h?: number }>
}

export const EMPTY_LOCAL: LocalLayer = { colors: {}, z: {}, ink: [], frames: {} }
const MAX_INK = 2000
const MAX_POINTS = 4000

export const isColor = (v: unknown): v is Color => typeof v === "string" && (COLORS as string[]).includes(v)
const isInkType = (v: unknown): v is InkType => v === "stroke" || v === "line" || v === "arrow"
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d)

/** A local layer from storage or a view code — anything malformed is dropped. */
export function readLocal(raw: unknown): LocalLayer {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_LOCAL
	const o = raw as Record<string, unknown>
	const colors: Record<string, Color> = {}
	if (o.colors && typeof o.colors === "object") for (const [k, v] of Object.entries(o.colors)) if (isColor(v) && k.length < 100) colors[k] = v
	const z: Record<string, number> = {}
	if (o.z && typeof o.z === "object") for (const [k, v] of Object.entries(o.z)) if (typeof v === "number" && Number.isFinite(v) && k.length < 100) z[k] = v
	const ink: Ink[] = []
	for (const e of Array.isArray(o.ink) ? o.ink.slice(0, MAX_INK) : []) {
		if (!e || typeof e !== "object") continue
		const i = e as Record<string, unknown>
		if (typeof i.id !== "string" || i.id.length > 100 || !isInkType(i.type)) continue
		const points = (Array.isArray(i.points) ? i.points.slice(0, MAX_POINTS) : []).filter((p): p is Point => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])).map(([x, y]) => [x, y] as Point)
		if (points.length === 0) continue
		ink.push({ id: i.id, type: i.type, color: isColor(i.color) ? i.color : "gray", x: num(i.x), y: num(i.y), width: num(i.width), height: num(i.height), points, strokeWidth: Math.min(40, Math.max(1, num(i.strokeWidth, 4))), z: num(i.z) })
	}
	const frames: LocalLayer["frames"] = {}
	if (o.frames && typeof o.frames === "object")
		for (const [k, v] of Object.entries(o.frames)) {
			if (k.length > 200 || !v || typeof v !== "object") continue
			const { w, h } = v as Record<string, unknown>
			const size: { w?: number; h?: number } = {}
			if (typeof w === "number" && Number.isFinite(w)) size.w = Math.min(4000, Math.max(FRAME_MIN_W, w))
			if (typeof h === "number" && Number.isFinite(h)) size.h = Math.min(8000, Math.max(FRAME_HEAD + ROW, h))
			if (size.w !== undefined || size.h !== undefined) frames[k] = size
		}
	return { colors, z, ink, frames }
}

/* ---------- colors ---------- */

/** A color name from a select value or a Notion option color. */
export function toColor(v: string | undefined | null): Color | null {
	const s = (v ?? "").trim().toLowerCase()
	if (!s) return null
	if ((COLORS as string[]).includes(s)) return s as Color
	if (s === "default") return "gray"
	return null
}

/** A stable color for an option without one. */
export function hashColor(seed: string): Color {
	let h = 0
	for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0
	return STICKY_COLORS[Math.abs(h) % STICKY_COLORS.length]
}

/* ---------- grouping ---------- */

export type GroupProp = { id: string; name: string; kind: GroupKind }

/** Properties the board can be grouped by, in schema order. */
export function groupableProps(src: SourceSnapshot): GroupProp[] {
	return Object.entries(src.propertySchemasById)
		.filter(([, s]) => (GROUPABLE as readonly string[]).includes(s.type))
		.map(([id, s]) => ({ id, name: s.name ?? id, kind: s.type as GroupKind }))
}

/** "auto" picks the first groupable property, "none" turns frames off; a missing id falls back to auto. */
export function resolveGroupBy(src: SourceSnapshot, pick: string): GroupProp | null {
	if (pick === "none") return null
	const all = groupableProps(src)
	return all.find((p) => p.id === pick) ?? all[0] ?? null
}

/** Values of the group property for a row: option names or page ids. */
export function groupValues(g: GroupProp, v: unknown): string[] {
	if (g.kind === "relation") return pointerIds(v)
	if (Array.isArray(v)) return v.map((e) => textOf(e).trim()).filter(Boolean)
	const s = textOf(v).trim()
	if (!s) return []
	// Multi-selects can arrive as comma-joined text.
	return g.kind === "multi_select" ? s.split(",").map((x) => x.trim()).filter(Boolean) : [s]
}

type Topic = { id: string; name: string; color: Color }

/** The frames: every option (select, multi-select) or every related page seen (relation). */
function topicsOf(src: SourceSnapshot, g: GroupProp, pageTitle: (id: string) => string | undefined): Topic[] {
	const schema: SchemaLike | undefined = src.propertySchemasById[g.id]
	if (g.kind !== "relation") {
		const out: Topic[] = (schema?.options ?? []).map((o) => ({ id: o.name, name: o.name, color: toColor(o.name) ?? toColor(o.color) ?? hashColor(o.name) }))
		// Values the schema doesn't list yet (e.g. just created) still get a frame.
		for (const r of src.items) for (const v of groupValues(g, r.propertiesById[g.id])) if (!out.some((t) => t.id === v)) out.push({ id: v, name: v, color: hashColor(v) })
		return out
	}
	const seen: Topic[] = []
	for (const r of src.items)
		for (const id of groupValues(g, r.propertiesById[g.id]))
			if (!seen.some((t) => t.id === id)) seen.push({ id, name: pageTitle(id) ?? "Untitled", color: "yellow" })
	// Linked pages have no color of their own: hand out distinct ones in name order.
	return seen.sort((a, b) => a.name.localeCompare(b.name)).map((t, i) => ({ ...t, color: STICKY_COLORS[i % STICKY_COLORS.length] }))
}

/** The n-th two-column slot of a frame, relative to its content area. */
/** Note columns that fit a frame of width `w`. */
export const colsFor = (w: number) => Math.max(1, Math.floor((w - 20) / ROW))
const slotAt = (n: number, cols = 2) => ({ x: 20 + (n % cols) * ROW, y: 12 + Math.floor(n / cols) * ROW })

/** Frame origins, `perRow` to a row. Heights come later from the contents. */
export function frameGrid(n: number, perRow: number, widths: number[] = []): { x: number; y: number }[] {
	const per = Math.max(1, Math.floor(perRow))
	const out: { x: number; y: number }[] = []
	let x = MARGIN
	for (let i = 0; i < n; i++) {
		if (i % per === 0) x = MARGIN
		out.push({ x, y: MARGIN + Math.floor(i / per) * (FRAME_MIN_H + FRAME_GAP) })
		x += (widths[i] ?? FRAME_W) + FRAME_GAP
	}
	return out
}

export type ReadOptions = {
	perRow: number
	showDone: boolean
	/** Stickies that pass the filters (null: all). */
	visible: Set<string> | null
	groupBy: GroupProp | null
	/** Frames with no notes are left out. */
	hideEmpty: boolean
	/** Pack notes in frames into free slots, ignoring stored positions (while filtering). */
	compact?: boolean
	pageTitle: (id: string) => string | undefined
	/** Property ids of the optional fields (see resolveSetup); null = not used. */
	author?: string | null
	done?: string | null
	fix?: string | null
}

/*
 * Setup. The database only needs Title, X and Y. Everything else is an
 * optional field picked once in the block's settings: "auto" guesses it from
 * the property names and types, "none" turns it off, anything else is a
 * property id. There are no other fallbacks.
 */
export type Field = "author" | "done" | "fix"
export type Picks = { groupBy: string; author: string; done: string; fix: string }
export type Setup = { group: GroupProp | null; author: string | null; done: string | null; fix: string | null }

/** Property types each field can use. */
export const FIELD_TYPES: Record<Field, string[]> = {
	author: ["people", "created_by", "last_edited_by"],
	done: ["checkbox"],
	fix: ["rich_text"],
}
const GUESS: Record<Field, RegExp> = {
	author: /author|written|writer|owner|creator|who|person/i,
	done: /done|fixed|resolved|closed|complete|erledigt/i,
	fix: /fix|resolution|solution|solved|how/i,
}

/** The properties a field can use, in schema order. */
export function fieldOptions(src: SourceSnapshot, f: Field): { id: string; name: string; type: string }[] {
	return Object.entries(src.propertySchemasById)
		.filter(([, p]) => FIELD_TYPES[f].includes(p.type))
		.map(([id, p]) => ({ id, name: p.name ?? id, type: p.type }))
}

function resolveField(src: SourceSnapshot, f: Field, pick: string): string | null {
	if (pick === "none") return null
	const all = fieldOptions(src, f)
	if (all.some((p) => p.id === pick)) return pick
	const named = all.find((p) => GUESS[f].test(p.name))
	if (named) return named.id
	// Who wrote it: a people property, else Created by. Done and the fix note are only taken by name.
	return f === "author" ? (all.find((p) => p.type === "people") ?? all.find((p) => p.type === "created_by"))?.id ?? null : null
}

export function resolveSetup(src: SourceSnapshot, picks: Picks): Setup {
	return { group: resolveGroupBy(src, picks.groupBy), author: resolveField(src, "author", picks.author), done: resolveField(src, "done", picks.done), fix: resolveField(src, "fix", picks.fix) }
}

export function readBoard(src: SourceSnapshot, local: LocalLayer, opts: ReadOptions): Board {
	const g = opts.groupBy
	let topics = g ? topicsOf(src, g, opts.pageTitle) : []
	const order = new Map(topics.map((t, i) => [t.id, i]))

	type Raw = { r: SourceRow; x: number | null; y: number | null; values: string[]; home: string | null; done: boolean }
	const raws: Raw[] = []
	for (const r of src.items) {
		const done = opts.done ? checkboxOf(r.propertiesById[opts.done]) : false
		if ((done && !opts.showDone) || (opts.visible && !opts.visible.has(r.id))) continue
		const values = g ? groupValues(g, r.propertiesById[g.id]) : []
		// A note with several values sits in the first frame (frame order).
		const home = values.filter((v) => order.has(v)).sort((a, b) => order.get(a)! - order.get(b)!)[0] ?? null
		raws.push({ r, x: numberOf(prop(src, r, "x")), y: numberOf(prop(src, r, "y")), values, home, done })
	}
	if (opts.hideEmpty) topics = topics.filter((t) => raws.some((w) => w.home === t.id))
	// Auto width: wider frames for more notes (2 columns up to 4 notes, then 3, then 4) keep them compact.
	const counts = new Map<string, number>()
	for (const w of raws) if (w.home) counts.set(w.home, (counts.get(w.home) ?? 0) + 1)
	const autoCols = (n: number) => (n <= 4 ? 2 : n <= 9 ? 3 : 4)
	const widths = topics.map((t) => local.frames[t.id]?.w ?? 20 + autoCols(counts.get(t.id) ?? 0) * ROW)
	const grid = frameGrid(topics.length, opts.perRow, widths)
	const origin = new Map(topics.map((t, i) => [t.id, grid[i]]))

	/*
	 * Placement. A stored position is kept when it still makes sense: inside
	 * its frame and not on top of another note (positions saved under another
	 * grouping often don't). Notes without a usable position fill their
	 * frame's free slots in database order; loose ones line up below the
	 * frames once those are sized.
	 */
	const clash = (list: { x: number; y: number }[], p: { x: number; y: number }) => list.some((u) => Math.abs(u.x - p.x) < STICKY * 0.6 && Math.abs(u.y - p.y) < STICKY * 0.6)
	const taken = new Map<string, { x: number; y: number }[]>()
	const looseTaken: { x: number; y: number }[] = []
	const frameBox = grid.map((g) => ({ x1: g.x - STICKY / 2, y1: g.y - STICKY / 2, x2: g.x + widths[grid.indexOf(g)] - STICKY / 2, y2: g.y + FRAME_MIN_H }))
	const kept = new Set<Raw>()
	for (const w of raws) {
		if (w.x === null || w.y === null || (opts.compact && w.home)) continue
		const p = { x: w.x, y: w.y }
		if (w.home && origin.has(w.home)) {
			const list = taken.get(w.home) ?? []
			if (p.x < -STICKY / 2 || p.x > widths[topics.findIndex((t) => t.id === w.home)] - STICKY / 2 || p.y < -STICKY / 2 || clash(list, p)) continue
			taken.set(w.home, [...list, p])
		} else {
			if (frameBox.some((b) => p.x > b.x1 && p.x < b.x2 && p.y > b.y1 && p.y < b.y2) || clash(looseTaken, p)) continue
			looseTaken.push(p)
		}
		kept.add(w)
	}
	const unplaced: Item[] = []
	const items: Item[] = []
	for (const w of raws) {
		const o = w.home ? origin.get(w.home) : undefined
		let x = 0
		let y = 0
		if (kept.has(w)) {
			x = w.x! + (o ? o.x : 0)
			y = w.y! + (o ? o.y + FRAME_HEAD : 0)
		} else if (o) {
			const used = taken.get(w.home!) ?? []
			const cols = colsFor(widths[topics.findIndex((t) => t.id === w.home)])
			let slot = slotAt(0, cols)
			for (let n = 1; clash(used, slot); n++) slot = slotAt(n, cols)
			taken.set(w.home!, [...used, slot])
			x = o.x + slot.x
			y = o.y + FRAME_HEAD + slot.y
		}
		const item: Item = {
			id: w.r.id,
			type: "sticky",
			title: textOf(prop(src, w.r, "title")),
			color: local.colors[w.r.id] ?? "yellow",
			x,
			y,
			width: STICKY,
			height: STICKY,
			points: [],
			strokeWidth: 2,
			z: local.z[w.r.id] ?? 0,
			groupId: o ? w.home : null,
			groupValues: w.values,
			authorIds: opts.author ? pointerIds(w.r.propertiesById[opts.author]) : [],
			done: w.done,
			resolution: opts.fix ? textOf(w.r.propertiesById[opts.fix]).trim() : "",
			sx: w.x,
			sy: w.y,
		}
		items.push(item)
		if (!o && !kept.has(w)) unplaced.push(item)
	}
	const groups = layoutFrames(topics, grid, items, widths, local.frames)
	const top = groups.reduce((m, f) => Math.max(m, f.y + f.h + FRAME_GAP), MARGIN)
	const per = Math.max(2, opts.perRow * 2)
	let n = 0
	for (const it of unplaced) {
		const at = () => ({ x: MARGIN + (n % per) * (STICKY + 24), y: top + Math.floor(n / per) * (STICKY + 24) })
		while (clash(looseTaken, at())) n++
		Object.assign(it, at())
		looseTaken.push(at())
		n++
	}
	for (const i of local.ink) items.push({ ...i, title: "", groupId: null, groupValues: [], authorIds: [], done: false, resolution: "" })

	let width = 1600
	let height = 1000
	for (const f of groups) {
		width = Math.max(width, f.x + f.w + 480)
		height = Math.max(height, f.y + f.h + 480)
	}
	for (const it of items) {
		width = Math.max(width, it.x + it.width + 240)
		height = Math.max(height, it.y + it.height + 240)
	}
	return { items, groups, width: Math.ceil(width), height: Math.ceil(height) }
}

/**
 * Frames at their grid spots, grown to fit their stickies; rows below a
 * taller frame move down with it (the grouped stickies move along, since
 * they are relative to their frame).
 */
function layoutFrames(topics: Topic[], grid: { x: number; y: number }[], items: Item[], widths: number[], sizes: LocalLayer["frames"]): Group[] {
	const inFrame = new Map<string, Item[]>()
	for (const it of items) if (it.groupId) inFrame.set(it.groupId, [...(inFrame.get(it.groupId) ?? []), it])
	// Sized to the notes plus one free row for more; a size set by hand wins, but never hides a note.
	const need = topics.map((t, i) => {
		let bottom = FRAME_HEAD + 12
		for (const it of inFrame.get(t.id) ?? []) bottom = Math.max(bottom, it.y - grid[i].y + it.height + 20)
		const hand = sizes[t.id]?.h
		return hand !== undefined ? Math.max(hand, bottom + 4) : bottom + ROW
	})
	// Row offsets: each row starts below the tallest frame of the row above.
	const rowY = new Map<number, number>()
	let y = MARGIN
	const rows = [...new Set(grid.map((g) => g.y))].sort((a, b) => a - b)
	for (const ry of rows) {
		rowY.set(ry, y)
		const tallest = Math.max(...grid.map((g, i) => (g.y === ry ? need[i] : 0)))
		y += tallest + FRAME_GAP
	}
	return topics.map((t, i) => {
		const dy = (rowY.get(grid[i].y) ?? grid[i].y) - grid[i].y
		const list = inFrame.get(t.id) ?? []
		for (const it of list) it.y += dy
		return { id: t.id, name: t.name, color: t.color, x: grid[i].x, y: grid[i].y + dy, w: widths[i], h: need[i], count: list.filter((it) => !it.done).length, auto: !sizes[t.id] }
	})
}

/**
 * The group-property write that moves a note from the frame it's shown in
 * (`from`) to `to` (null: out of every frame). Other values are kept.
 */
export function moveValues(kind: GroupKind, values: string[], from: string | null, to: string | null): string[] {
	if (kind === "select") return to ? [to] : []
	const rest = values.filter((v) => v !== from && v !== to)
	return to ? [to, ...rest] : rest
}

/** The frame whose area holds the point, if any. */
export function frameAt(groups: Group[], x: number, y: number): Group | undefined {
	return groups.find((g) => x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h)
}

/** Stored position of a note: relative to its frame's content area, or absolute. */
export function storedPos(groups: Group[], groupId: string | null, x: number, y: number): { x: number; y: number } {
	const g = groupId ? groups.find((f) => f.id === groupId) : undefined
	return g ? { x: Math.round(x - g.x), y: Math.round(y - g.y - FRAME_HEAD) } : { x: Math.round(x), y: Math.round(y) }
}

/** Neat positions, as many columns as fit, (absolute) for the stickies of a frame, in stacking order. */
export function tidy(g: Group, stickies: Item[]): Map<string, { x: number; y: number }> {
	const out = new Map<string, { x: number; y: number }>()
	const sorted = [...stickies].sort((a, b) => a.y - b.y || a.x - b.x)
	const cols = colsFor(g.w)
	sorted.forEach((it, i) => out.set(it.id, { x: g.x + 20 + (i % cols) * ROW, y: g.y + FRAME_HEAD + 12 + Math.floor(i / cols) * ROW }))
	return out
}

/** A free spot for a new sticky in a frame: the next slot after the last sticky. */
export function nextSlot(g: Group, stickies: Item[]): { x: number; y: number } {
	const cols = colsFor(g.w)
	const n = stickies.length
	return { x: g.x + 20 + (n % cols) * ROW, y: g.y + FRAME_HEAD + 12 + Math.floor(n / cols) * ROW }
}

export const initials = (name: string): string => {
	const p = name.trim().split(/\s+/)
	return ((p[0]?.[0] ?? "") + (p.length > 1 ? (p[p.length - 1][0] ?? "") : "")).toUpperCase()
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name
