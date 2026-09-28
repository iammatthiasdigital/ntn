import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from "react"
import { dayIso, EMPTY_FILTERS } from "./kit/filters/core"
import { Plus } from "./kit/filters/icons"
import { PropIcon } from "./kit/filters/icons"
import { ColumnIcon, LayersIcon, NavRow, Note, NumberRow, PersonIcon, PickRow, Sep, SettingsShell, TargetIcon, ToggleRow } from "./kit/settings"
import { W, type BlockData, type PropertyWrite } from "./kit/sources"
import { oneOf, within } from "./kit/share"
import { Loading, Setup, Toolbar, useFiltered, usePersistentView, type WithFilters } from "./kit/toolbar"
import {
	EMPTY_LOCAL,
	firstName,
	frameAt,
	FRAME_HEAD,
	groupableProps,
	initials,
	moveValues,
	nextSlot,
	readBoard,
	readLocal,
	resolveGroupBy,
	STICKY,
	storedPos,
	tidy,
	type Color,
	type Group,
	type Ink,
	type Item,
	type LocalLayer,
	type Point,
} from "./board"
import { arrowHead, boundingBox, circleHitsPolyline, samplePolyline, smoothPath, snapTo45, stickyRotation } from "./geometry"
import { TOOL_KEYS, ToolOptions, ToolPill, type Tool } from "./Tools"
import { MOUTH_AT, Turtle, TURTLE_H } from "./Turtle"

export type Keys = "items"
type Ready = Extract<BlockData<Keys>, { status: "ready" }>

type View = WithFilters & {
	/** Property id the frames come from; "auto" = the first select / multi-select / relation, "none" = no frames. */
	groupBy: string
	/** Leave out frames without notes. */
	hideEmpty: boolean
	/** Stickies in a frame take the group's color. */
	byTopic: boolean
	authors: boolean
	showDone: boolean
	perRow: number
	height: number
	look: "whiteboard" | "cork"
}

const DEFAULT: View = { groupBy: "auto", hideEmpty: false, byTopic: true, authors: true, showDone: false, perRow: 4, height: 600, look: "whiteboard", filters: EMPTY_FILTERS, filterBar: true }
/** Imported views stay within what the settings allow. */
const sanitize = (v: View): View => ({ ...v, perRow: Math.round(within(v.perRow, 1, 12, DEFAULT.perRow)), height: Math.round(within(v.height, 320, 4000, DEFAULT.height)), look: oneOf(v.look, ["whiteboard", "cork"] as const, DEFAULT.look) })
const ZOOMS = [0.3, 0.4, 0.55, 0.7, 0.85, 1, 1.2, 1.5] as const
const FLY_MS = 820

export function BoardView({ data, theme }: { data: BlockData<Keys>; theme: "light" | "dark" }) {
	return (
		<div className="nb wb-block" data-theme={theme}>
			{data.status === "loading" ? (
				<Loading what="the whiteboard" />
			) : data.status === "unbound" ? (
				<Setup title="Connect a database to start drawing." missing={data.missing}>
					<li>
						<b>Notes</b>: Title, X and Y (numbers), and optionally Author (people), Done (checkbox) and How it was fixed (text). Any select, multi-select or
						relation of the database can group the notes into frames.
					</li>
				</Setup>
			) : (
				<Ready data={data} />
			)}
		</div>
	)
}

type Draft = { kind: "pen"; points: Point[] } | { kind: "line" | "arrow"; start: Point; end: Point }
type Drag = { id: string; dx: number; dy: number; moved: boolean }
type Pan = { start: Point; origin: Point }
type Fly = { key: string; item: Item; color: Color; left: number; top: number; size: number; dx: number; dy: number; rot: number }
type Toast = { text: string; undo?: () => void }

/** Rich text runs stay under Notion's 2000-character limit. */
const longText = (s: string) => ({ type: "rich_text", rich_text: (s.match(/[\s\S]{1,1900}/g) ?? []).map((c) => ({ type: "text", text: { content: c } })) })
/** Positions are the board's own: they stay out of the filter menu. */
const HIDDEN_PROPS = ["x", "y"]

/** This viewer's colors, stacking and drawings, kept in the browser next to the view. */
function useLocalLayer(key: string): [LocalLayer, (f: (l: LocalLayer) => LocalLayer) => void] {
	const [layer, setLayer] = useState<LocalLayer>(() => {
		try {
			const raw = window.localStorage.getItem(key)
			return raw ? readLocal(JSON.parse(raw)) : EMPTY_LOCAL
		} catch {
			return EMPTY_LOCAL
		}
	})
	const first = useRef(true)
	useEffect(() => {
		if (first.current) {
			first.current = false
			return
		}
		const t = window.setTimeout(() => {
			try {
				window.localStorage.setItem(key, JSON.stringify(layer))
			} catch {
				// Storage full or blocked: the board still works for this session.
			}
		}, 300)
		return () => window.clearTimeout(t)
	}, [key, layer])
	return [layer, setLayer]
}
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi))
/** The local fields of a drawing edit. */
function pickInk(p: Partial<Item>): Partial<Ink> {
	const out: Partial<Ink> = {}
	if (p.color) out.color = p.color
	if (p.strokeWidth !== undefined) out.strokeWidth = p.strokeWidth
	if (p.x !== undefined) out.x = Math.round(p.x)
	if (p.y !== undefined) out.y = Math.round(p.y)
	if (p.z !== undefined) out.z = p.z
	return out
}
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
let tmp = 0

function Ready({ data }: { data: Ready }) {
	const [view, setView] = usePersistentView(data.storageKey, DEFAULT)
	const setUi = (f: Partial<View>) => setView((v) => ({ ...v, ...f }))
	const today = useMemo(() => dayIso(new Date()), [])
	const { items: itemsSrc } = data.sources
	const [local, setLocal] = useLocalLayer(`${data.storageKey}:board`)
	const { properties: allProps, visible, filtering } = useFiltered(itemsSrc, view.filters, data.resolvers, today)
	const hidden = useMemo(() => new Set(HIDDEN_PROPS.map((k) => itemsSrc.propertyIdsByKey[k]).filter(Boolean)), [itemsSrc.propertyIdsByKey])
	const properties = useMemo(() => allProps.filter((p) => !hidden.has(p.id)), [allProps, hidden])
	const groupProp = useMemo(() => resolveGroupBy(itemsSrc, view.groupBy), [itemsSrc, view.groupBy])
	const base = useMemo(
		() => readBoard(itemsSrc, local, { perRow: view.perRow, showDone: true, visible: filtering ? visible : null, groupBy: groupProp, hideEmpty: view.hideEmpty, pageTitle: data.resolvers.pageTitle }),
		[itemsSrc, local, view.perRow, visible, filtering, groupProp, view.hideEmpty, data.resolvers.pageTitle]
	)
	const me = data.resolvers.meId
	const has = (k: string) => itemsSrc.propertyIdsByKey[k] !== undefined
	const canGroup = !!groupProp
	const canDone = has("done")

	/* ---- optimistic layer: local edits over the rows until the host catches up ---- */
	const [over, setOver] = useState<Record<string, Partial<Item> & { t: number }>>({})
	const [gone, setGone] = useState<ReadonlySet<string>>(new Set())
	const [pending, setPending] = useState<(Item & { sent?: number })[]>([])
	useEffect(() => {
		const now = Date.now()
		setOver((o) => {
			let changed = false
			const next: typeof o = {}
			for (const [id, patch] of Object.entries(o)) {
				const cur = base.items.find((it) => it.id === id)
				const caught = cur && Object.entries(patch).every(([k, v]) => k === "t" || (typeof v === "number" ? Math.abs((cur[k as keyof Item] as number) - v) < 1.5 : JSON.stringify(cur[k as keyof Item]) === JSON.stringify(v)))
				if (caught || now - patch.t > 8000) changed = true
				else next[id] = patch
			}
			return changed ? next : o
		})
		setPending((ps) => {
			const next = ps.filter((p) => !p.sent || (now - p.sent < 10000 && !base.items.some((it) => it.type === p.type && it.title === p.title && Math.abs(it.x - p.x) < 2 && Math.abs(it.y - p.y) < 2)))
			return next.length === ps.length ? ps : next
		})
	}, [base])

	const items = useMemo(() => {
		const merged = base.items.filter((it) => !gone.has(it.id)).map((it) => (over[it.id] ? { ...it, ...over[it.id] } : it))
		return [...merged, ...pending].filter((it) => view.showDone || !it.done)
	}, [base.items, gone, over, pending, view.showDone])
	const groups = useMemo(() => base.groups.map((g) => ({ ...g, count: items.filter((it) => it.groupId === g.id && it.type === "sticky" && !it.done).length })), [base.groups, items])
	const groupOf = (id: string | null) => (id ? groups.find((g) => g.id === id) : undefined)
	const fillOf = (it: Item): Color => (view.byTopic && it.groupId ? (groupOf(it.groupId)?.color ?? it.color) : it.color)

	const [toast, setToast] = useState<Toast | null>(null)
	useEffect(() => {
		if (!toast) return
		const t = window.setTimeout(() => setToast(null), 6000)
		return () => window.clearTimeout(t)
	}, [toast])
	const fail = (err: string | null) => (err ? (setToast({ text: `Couldn't save: ${err}` }), true) : false)
	const only = (w: PropertyWrite): PropertyWrite => Object.fromEntries(Object.entries(w).filter(([k]) => has(k)))

	const patch = (id: string, p: Partial<Item>) => setOver((o) => ({ ...o, [id]: { ...o[id], ...p, t: Date.now() } }))
	/** The group-property write for a note's values. */
	const groupWrite = (values: string[]): PropertyWrite => {
		if (!groupProp) return {}
		const v = groupProp.kind === "select" ? W.select(values[0] ?? null) : groupProp.kind === "multi_select" ? W.multi(values) : W.relation(values)
		return { [groupProp.id]: v }
	}
	/**
	 * Saves a change. Notes write their text, position (relative to their
	 * frame), group value, Done and fix to the database; colors, stacking and
	 * every drawing stay in this browser.
	 */
	const save = async (it: Item, p: Partial<Item>) => {
		if (it.type !== "sticky") {
			setLocal((l) => ({ ...l, ink: l.ink.map((i) => (i.id === it.id ? { ...i, ...pickInk(p) } : i)) }))
			return
		}
		const next = { ...it, ...p }
		if ("groupId" in p) next.groupValues = moveValues(groupProp?.kind ?? "select", it.groupValues, it.groupId, next.groupId)
		patch(it.id, { ...p, ...("groupId" in p ? { groupValues: next.groupValues } : {}) })
		if ("color" in p || "z" in p)
			setLocal((l) => ({ ...l, colors: "color" in p ? { ...l.colors, [it.id]: next.color } : l.colors, z: "z" in p ? { ...l.z, [it.id]: next.z } : l.z }))
		const w: PropertyWrite = {}
		if ("x" in p || "y" in p || "groupId" in p) {
			const pos = storedPos(groups, next.groupId, next.x, next.y)
			w.x = W.number(pos.x)
			w.y = W.number(pos.y)
			if ("groupId" in p && next.groupId !== it.groupId) Object.assign(w, groupWrite(next.groupValues))
		}
		if ("title" in p) w.title = W.title(next.title)
		if ("done" in p) w.done = W.checkbox(next.done)
		if ("resolution" in p) w.resolution = longText(next.resolution)
		const out = only(w)
		if (Object.keys(out).length) fail(await data.mutations.update("items", it.id, out))
	}
	const create = async (it: Item) => {
		if (it.type !== "sticky") {
			const r = Math.round
			const ink: Ink = { id: `ink-${Date.now().toString(36)}-${tmp++}`, type: it.type, color: it.color, x: r(it.x), y: r(it.y), width: r(it.width), height: r(it.height), points: it.points.map(([x, y]) => [r(x), r(y)] as Point), strokeWidth: it.strokeWidth, z: it.z }
			setLocal((l) => ({ ...l, ink: [...l.ink, ink] }))
			return
		}
		const pos = storedPos(groups, it.groupId, it.x, it.y)
		const w: PropertyWrite = {
			title: W.title(it.title),
			x: W.number(pos.x),
			y: W.number(pos.y),
			...(me ? { author: W.people([me]) } : {}),
		}
		setPending((ps) => [...ps.filter((p) => p.id !== it.id), { ...it, sent: Date.now() }])
		if (fail(await data.mutations.create("items", { ...only(w), ...(it.groupId ? groupWrite([it.groupId]) : {}) }))) setPending((ps) => ps.filter((p) => p.id !== it.id))
		else if (it.color !== "yellow" && !(view.byTopic && it.groupId)) rememberColor.current = { title: it.title, color: it.color }
	}
	const remove = async (it: Item) => {
		if (it.type !== "sticky") return setLocal((l) => ({ ...l, ink: l.ink.filter((i) => i.id !== it.id) }))
		if (pending.some((p) => p.id === it.id)) return setPending((ps) => ps.filter((p) => p.id !== it.id))
		setGone((g) => new Set([...g, it.id]))
		fail(await data.mutations.archive("items", it.id))
	}
	/** A new note's local color, attached once the host returns its row. */
	const rememberColor = useRef<{ title: string; color: Color } | null>(null)
	useEffect(() => {
		const want = rememberColor.current
		if (!want) return
		const row = base.items.find((it) => it.type === "sticky" && it.title === want.title && !local.colors[it.id])
		if (!row) return
		rememberColor.current = null
		setLocal((l) => ({ ...l, colors: { ...l.colors, [row.id]: want.color } }))
	}, [base.items, local.colors, setLocal])

	/* ---- tools and viewport ---- */
	const [tool, setToolState] = useState<Tool>("select")
	const [ink, setInk] = useState<Color>("gray")
	const [fill, setFill] = useState<Color>("yellow")
	const [width, setWidth] = useState(4)
	const [radius, setRadius] = useState(16)
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [editingId, setEditingId] = useState<string | null>(null)
	const [draft, setDraft] = useState<Draft | null>(null)
	const [drag, setDrag] = useState<Drag | null>(null)
	const [pan, setPan] = useState<Point>([0, 0])
	const [scale, setScale] = useState(1)
	const [panDrag, setPanDrag] = useState<Pan | null>(null)
	const [space, setSpace] = useState(false)
	const [eraserAt, setEraserAt] = useState<Point | null>(null)
	const [flying, setFlying] = useState<Fly[]>([])
	const rootRef = useRef<HTMLDivElement>(null)
	const erasing = useRef(false)
	const maxZ = useMemo(() => items.reduce((m, it) => Math.max(m, it.z), 0), [items])
	const sorted = useMemo(() => [...items].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id)), [items])
	const selected = items.find((it) => it.id === selectedId) ?? null
	const worldW = base.width
	const worldH = base.height

	const clampPan = useCallback(
		([x, y]: Point, s = scale): Point => {
			const el = rootRef.current
			const vw = el?.clientWidth ?? 800
			const vh = el?.clientHeight ?? view.height
			return [clamp(x, Math.min(0, vw - worldW * s - 40), 40), clamp(y, Math.min(0, vh - worldH * s - 40), 40)]
		},
		[scale, worldW, worldH, view.height]
	)

	const setTool = useCallback((t: Tool) => {
		setToolState(t)
		setDraft(null)
		setDrag(null)
		if (t !== "select") {
			setSelectedId(null)
			setEditingId(null)
		}
	}, [])

	const toScreen = (e: { clientX: number; clientY: number }): Point => {
		const r = rootRef.current?.getBoundingClientRect()
		return r ? [e.clientX - r.left, e.clientY - r.top] : [0, 0]
	}
	const toWorld = (e: { clientX: number; clientY: number }): Point => {
		const [x, y] = toScreen(e)
		return [(x - pan[0]) / scale, (y - pan[1]) / scale]
	}

	const zoomTo = (s2: number, at?: Point) => {
		const el = rootRef.current
		const c: Point = at ?? [(el?.clientWidth ?? 800) / 2, (el?.clientHeight ?? view.height) / 2]
		const wx = (c[0] - pan[0]) / scale
		const wy = (c[1] - pan[1]) / scale
		setScale(s2)
		setPan(clampPan([c[0] - wx * s2, c[1] - wy * s2], s2))
	}
	const zoomStep = (dir: 1 | -1, at?: Point) => {
		const next = dir > 0 ? (ZOOMS.find((z) => z > scale + 0.01) ?? ZOOMS[ZOOMS.length - 1]) : ([...ZOOMS].reverse().find((z) => z < scale - 0.01) ?? ZOOMS[0])
		zoomTo(next, at)
	}
	const fit = () => {
		const el = rootRef.current
		if (!el) return
		let x1 = Infinity
		let y1 = Infinity
		let x2 = -Infinity
		let y2 = -Infinity
		for (const b of [...groups.map((g) => ({ x: g.x, y: g.y, w: g.w, h: g.h })), ...items.map((it) => ({ x: it.x, y: it.y, w: it.width, h: it.height }))]) {
			x1 = Math.min(x1, b.x)
			y1 = Math.min(y1, b.y)
			x2 = Math.max(x2, b.x + b.w)
			y2 = Math.max(y2, b.y + b.h)
		}
		if (!Number.isFinite(x1)) return zoomTo(1)
		const s = Math.max(ZOOMS[0], Math.min(1.2, (el.clientWidth - 48) / (x2 - x1), (el.clientHeight - 110) / (y2 - y1)))
		setScale(s)
		setPan([24 - x1 * s + Math.max(0, (el.clientWidth - 48 - (x2 - x1) * s) / 2), 20 - y1 * s])
	}

	// Wheel pans; pinch / ctrl+wheel zooms.
	const wheel = useRef({ pan, scale, clampPan, zoomStep })
	wheel.current = { pan, scale, clampPan, zoomStep }
	useEffect(() => {
		const el = rootRef.current
		if (!el) return
		let acc = 0
		const onWheel = (e: WheelEvent) => {
			e.preventDefault()
			const w = wheel.current
			if (e.ctrlKey || e.metaKey) {
				acc += e.deltaY
				if (Math.abs(acc) < 30) return
				const r = el.getBoundingClientRect()
				w.zoomStep(acc < 0 ? 1 : -1, [e.clientX - r.left, e.clientY - r.top])
				acc = 0
				return
			}
			const k = e.deltaMode === 1 ? 18 : 1
			setPan((p) => w.clampPan([p[0] - e.deltaX * k, p[1] - e.deltaY * k]))
		}
		el.addEventListener("wheel", onWheel, { passive: false })
		return () => el.removeEventListener("wheel", onWheel)
	}, [])
	useEffect(() => {
		const up = (e: KeyboardEvent) => e.code === "Space" && setSpace(false)
		const blur = () => setSpace(false)
		window.addEventListener("keyup", up)
		window.addEventListener("blur", blur)
		return () => {
			window.removeEventListener("keyup", up)
			window.removeEventListener("blur", blur)
		}
	}, [])

	const stickyAt = (p: Point) =>
		[...items]
			.filter((it) => it.type === "sticky")
			.sort((a, b) => b.z - a.z)
			.find((it) => p[0] >= it.x && p[0] <= it.x + it.width && p[1] >= it.y && p[1] <= it.y + it.height)

	const eraseAt = (p: Point) => {
		for (const it of items) {
			if (it.type === "sticky" || gone.has(it.id)) continue
			const abs = it.points.map(([px, py]) => [px + it.x, py + it.y] as Point)
			if (circleHitsPolyline(p, radius + it.strokeWidth / 2 + 1, abs)) void remove(it)
		}
	}

	/** A new sticky: local until it has text, then written to the database. */
	const newSticky = (x: number, y: number, g?: Group) => {
		const it: Item = {
			id: `tmp-${Date.now().toString(36)}-${tmp++}`,
			type: "sticky",
			title: "",
			color: g && view.byTopic ? g.color : fill,
			x: Math.round(clamp(x, 8, worldW - STICKY - 8)),
			y: Math.round(clamp(y, 8, worldH - STICKY - 8)),
			width: STICKY,
			height: STICKY,
			points: [],
			strokeWidth: 2,
			z: maxZ + 1,
			groupId: g?.id ?? null,
			groupValues: g ? [g.id] : [],
			authorIds: me ? [me] : [],
			done: false,
			resolution: "",
		}
		setPending((ps) => [...ps, it])
		setToolState("select")
		setSelectedId(it.id)
		setEditingId(it.id)
	}
	const commitText = (id: string, text: string) => {
		setEditingId(null)
		const local = pending.find((p) => p.id === id)
		if (local && !local.sent) {
			if (!text.trim()) return setPending((ps) => ps.filter((p) => p.id !== id))
			void create({ ...local, title: text })
			return
		}
		const it = items.find((x) => x.id === id)
		if (it && it.title !== text && !local) void save(it, { title: text })
	}

	/**
	 * Checking a note off: ask how it was fixed (prefilled, editable), celebrate
	 * full-screen, then the turtle eats the note and the Done box is written.
	 */
	const [ask, setAsk] = useState<Item | null>(null)
	const [party, setParty] = useState<{ it: Item; text: string } | null>(null)
	const [eating, setEating] = useState(0)
	const [doneToday, setDoneToday] = useState(0)
	const canFix = has("resolution")
	const undoDone = (it: Item) => () => void save(it, { done: false })
	const markDone = (it: Item, done: boolean) => {
		if (!canDone) return setToast({ text: "Map the Done checkbox in the block's data settings to check notes off." })
		if (!done) return void save(it, { done: false })
		setSelectedId(null)
		if (canFix) setAsk(it)
		else finish(it, null)
	}
	const finish = (it: Item, text: string | null) => {
		setAsk(null)
		const fix = text === null ? {} : { resolution: text.trim() }
		if (view.showDone || reducedMotion()) {
			void save(it, { done: true, ...fix })
			return setToast({ text: `“${it.title.slice(0, 40) || "Note"}” is done.`, undo: undoDone(it) })
		}
		if (text !== null && text.trim() !== it.resolution) void save(it, fix)
		setDoneToday((n) => n + 1)
		setParty({ it, text: text?.trim() ?? "" })
	}
	/** After the party: the note flies into the turtle's mouth. */
	const feed = (it: Item) => {
		setParty(null)
		const el = rootRef.current
		const size = STICKY * scale
		const left = it.x * scale + pan[0]
		const top = it.y * scale + pan[1]
		const mouth: Point = [22 + MOUTH_AT.x * 4, (el?.clientHeight ?? view.height) - 18 - TURTLE_H * 4 + MOUTH_AT.y * 4]
		setFlying((f) => [...f, { key: `${it.id}-${Date.now()}`, item: it, color: fillOf(it), left, top, size, dx: mouth[0] - (left + size / 2), dy: mouth[1] - (top + size / 2), rot: stickyRotation(it.id) }])
		window.setTimeout(() => setEating((n) => n + 1), FLY_MS - 260)
		window.setTimeout(() => {
			void save(it, { done: true })
			setToast({ text: `Om nom. “${it.title.slice(0, 40) || "Note"}” is done.`, undo: undoDone(it) })
		}, FLY_MS - 60)
	}

	/* ---- pointer handling ---- */
	const onDown = (e: RPointerEvent<HTMLDivElement>) => {
		if (e.button !== 0 && e.button !== 1) return
		const t = e.target as HTMLElement
		if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement || t.closest(".wb-ui")) return
		e.preventDefault()
		rootRef.current?.focus({ preventScroll: true })
		rootRef.current?.setPointerCapture(e.pointerId)
		if (tool === "hand" || space || e.button === 1) {
			setPanDrag({ start: toScreen(e), origin: pan })
			return
		}
		const p = toWorld(e)
		switch (tool) {
			case "select":
				setSelectedId(null)
				setEditingId(null)
				// Dragging empty canvas pans, like any board.
				setPanDrag({ start: toScreen(e), origin: pan })
				break
			case "pen":
				setDraft({ kind: "pen", points: [p] })
				break
			case "line":
			case "arrow":
				setDraft({ kind: tool, start: p, end: p })
				break
			case "sticky": {
				const hit = stickyAt(p)
				if (hit) {
					setToolState("select")
					setSelectedId(hit.id)
					break
				}
				newSticky(p[0] - STICKY / 2, p[1] - STICKY / 2, canGroup ? frameAt(groups, p[0], p[1]) : undefined)
				break
			}
			case "eraser": {
				erasing.current = true
				setEraserAt(p)
				eraseAt(p)
				break
			}
		}
	}
	const onMove = (e: RPointerEvent<HTMLDivElement>) => {
		if (panDrag) {
			const s = toScreen(e)
			setPan(clampPan([panDrag.origin[0] + s[0] - panDrag.start[0], panDrag.origin[1] + s[1] - panDrag.start[1]]))
			return
		}
		const p = toWorld(e)
		if (tool === "eraser") {
			setEraserAt(p)
			if (erasing.current) eraseAt(p)
		}
		if (draft?.kind === "pen") {
			setDraft((d) => {
				if (!d || d.kind !== "pen") return d
				const last = d.points[d.points.length - 1]
				return (p[0] - last[0]) ** 2 + (p[1] - last[1]) ** 2 < 4 ? d : { kind: "pen", points: [...d.points, p] }
			})
		} else if (draft) {
			setDraft((d) => {
				if (!d || d.kind === "pen") return d
				let end = p
				if (e.shiftKey) {
					const [sx, sy] = snapTo45(p[0] - d.start[0], p[1] - d.start[1])
					end = [d.start[0] + sx, d.start[1] + sy]
				}
				return { ...d, end }
			})
		}
		if (drag) {
			const it = items.find((x) => x.id === drag.id)
			if (it) {
				const x = clamp(p[0] - drag.dx, 0, worldW - it.width)
				const y = clamp(p[1] - drag.dy, 0, worldH - it.height)
				patch(it.id, { x, y })
				if (!drag.moved) setDrag({ ...drag, moved: true })
			}
		}
	}
	const finishDraft = () => {
		if (!draft) return
		const common = { id: `tmp-${Date.now().toString(36)}-${tmp++}`, color: ink, strokeWidth: width, z: maxZ + 1, groupId: null, groupValues: [], authorIds: me ? [me] : [], done: false, resolution: "" }
		if (draft.kind === "pen") {
			const pts = samplePolyline(draft.points, 2)
			const b = boundingBox(pts)
			void create({ ...common, type: "stroke", title: "Stroke", x: Math.round(b.x), y: Math.round(b.y), width: b.width, height: b.height, points: pts.map(([x, y]) => [x - b.x, y - b.y] as Point) })
		} else if (Math.hypot(draft.end[0] - draft.start[0], draft.end[1] - draft.start[1]) >= 4) {
			const b = boundingBox([draft.start, draft.end])
			void create({
				...common,
				type: draft.kind,
				title: draft.kind === "line" ? "Line" : "Arrow",
				x: Math.round(b.x),
				y: Math.round(b.y),
				width: b.width,
				height: b.height,
				points: [
					[draft.start[0] - b.x, draft.start[1] - b.y],
					[draft.end[0] - b.x, draft.end[1] - b.y],
				],
			})
		}
		setDraft(null)
	}
	const onUp = () => {
		erasing.current = false
		if (panDrag) return setPanDrag(null)
		if (drag) {
			const it = items.find((x) => x.id === drag.id)
			setDrag(null)
			if (it && drag.moved) {
				// Dropping a sticky into a topic frame files it under that topic.
				const g = it.type === "sticky" && canGroup ? frameAt(groups, it.x + it.width / 2, it.y + it.height / 2) : undefined
				const groupId = it.type === "sticky" ? (g?.id ?? null) : null
				if (pending.some((p) => p.id === it.id)) setPending((ps) => ps.map((p) => (p.id === it.id ? { ...p, x: it.x, y: it.y, groupId } : p)))
				else void save(it, { x: it.x, y: it.y, groupId, z: maxZ + 1 })
			}
		}
		if (draft) finishDraft()
	}
	const onCancel = () => {
		erasing.current = false
		setPanDrag(null)
		setDrag(null)
		setDraft(null)
	}
	const onItemDown = (e: RPointerEvent, it: Item) => {
		if (space || tool !== "select" || e.button !== 0) return
		e.stopPropagation()
		rootRef.current?.focus({ preventScroll: true })
		rootRef.current?.setPointerCapture(e.pointerId)
		setSelectedId(it.id)
		if (editingId === it.id) return
		if (editingId) setEditingId(null)
		const p = toWorld(e)
		setDrag({ id: it.id, dx: p[0] - it.x, dy: p[1] - it.y, moved: false })
	}

	const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
		const t = e.target as HTMLElement
		if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) return
		const key = e.key.toLowerCase()
		if (e.code === "Space") {
			e.preventDefault()
			return setSpace(true)
		}
		if (key === "escape") {
			setTool("select")
			setSelectedId(null)
			return
		}
		if ((key === "delete" || key === "backspace") && selected) {
			e.preventDefault()
			void remove(selected)
			setSelectedId(null)
			return
		}
		if (key === "enter" && selected?.type === "sticky") {
			e.preventDefault()
			return setEditingId(selected.id)
		}
		if (key === "d" && selected?.type === "sticky") return markDone(selected, !selected.done)
		if (key.startsWith("arrow") && selected) {
			e.preventDefault()
			const step = e.shiftKey ? 10 : 1
			const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0
			const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0
			void save(selected, { x: selected.x + dx, y: selected.y + dy })
			return
		}
		if (key === "+" || key === "=") return zoomStep(1)
		if (key === "-") return zoomStep(-1)
		if (key === "0") return fit()
		if (!e.metaKey && !e.ctrlKey && !e.altKey && TOOL_KEYS[key]) setTool(TOOL_KEYS[key])
	}

	/* ---- frames ---- */
	const tidyFrame = (g: Group) => {
		const list = items.filter((it) => it.groupId === g.id && it.type === "sticky" && !pending.some((p) => p.id === it.id))
		for (const [id, pos] of tidy(g, list)) {
			const it = list.find((x) => x.id === id)!
			if (Math.abs(it.x - pos.x) > 1 || Math.abs(it.y - pos.y) > 1) void save(it, pos)
		}
	}
	const [hoverFrame, setHoverFrame] = useState<string | null>(null)
	useEffect(() => {
		const it = drag?.moved ? items.find((x) => x.id === drag.id) : undefined
		const g = it && it.type === "sticky" ? frameAt(groups, it.x + it.width / 2, it.y + it.height / 2) : undefined
		setHoverFrame(g?.id ?? null)
	}, [drag, items, groups])

	/* ---- settings ---- */
	const [page, setPage] = useState<"root" | "look" | "group">("root")
	const groupable = useMemo(() => groupableProps(itemsSrc), [itemsSrc])
	const settings = (anchor: HTMLElement | null, close: () => void) => {
		const shut = () => {
			setPage("root")
			close()
		}
		if (page === "look")
			return (
				<SettingsShell anchor={anchor} onClose={shut} title="Look" onBack={() => setPage("root")}>
					<PickRow label="Whiteboard" sub="Dot grid, marker ink" selected={view.look === "whiteboard"} onClick={() => setUi({ look: "whiteboard" })} />
					<PickRow label="Cork board" sub="Pinned notes and paper topics" selected={view.look === "cork"} onClick={() => setUi({ look: "cork" })} />
				</SettingsShell>
			)
		if (page === "group")
			return (
				<SettingsShell anchor={anchor} onClose={shut} title="Group by" onBack={() => setPage("root")}>
					<PickRow label="No frames" sub="Notes float freely" selected={!groupProp} onClick={() => setUi({ groupBy: "none" })} />
					{groupable.map((g) => (
						<PickRow
							key={g.id}
							icon={<PropIcon type={g.kind} />}
							label={g.name}
							sub={g.kind === "relation" ? "A frame per linked page" : g.kind === "multi_select" ? "A frame per option; notes sit in their first one" : "A frame per option"}
							selected={groupProp?.id === g.id}
							onClick={() => setUi({ groupBy: g.id })}
						/>
					))}
					{groupable.length === 0 ? <Note>Add a select, multi-select or relation property to the database to group notes into frames.</Note> : null}
					<Sep />
					<ToggleRow label="Hide empty frames" on={view.hideEmpty} onChange={(v) => setUi({ hideEmpty: v })} />
					<Note>Dropping a note into a frame sets its value in Notion. Colors, drawings and arrows stay on your device; share them with the view code.</Note>
				</SettingsShell>
			)
		return (
			<SettingsShell anchor={anchor} onClose={shut} title="Whiteboard settings">
				<NavRow icon={<LayersIcon />} label="Look" value={view.look === "cork" ? "Cork board" : "Whiteboard"} onClick={() => setPage("look")} />
				<NavRow icon={<ColumnIcon />} label="Group by" value={groupProp?.name ?? "None"} onClick={() => setPage("group")} />
				<Sep />
				<ToggleRow icon={<TargetIcon />} label="Color notes by group" sub="Notes in a frame use the frame's color" on={view.byTopic} onChange={(v) => setUi({ byTopic: v })} />
				<ToggleRow icon={<PersonIcon />} label="Show who wrote it" on={view.authors} onChange={(v) => setUi({ authors: v })} />
				<ToggleRow label="Show done notes" sub="Faded, with a check. The bin shows them too." on={view.showDone} onChange={(v) => setUi({ showDone: v })} />
				<Sep />
				<NumberRow label="Frames per row" value={view.perRow} min={1} onChange={(v) => setUi({ perRow: Math.max(1, Math.min(12, Math.round(v))) })} />
				<NumberRow label="Board height" value={view.height} min={320} step={40} onChange={(v) => setUi({ height: Math.max(320, Math.min(4000, Math.round(v))) })} suffix="px" />
			</SettingsShell>
		)
	}

	const stickies = items.filter((it) => it.type === "sticky" && !it.done).length
	const sub = `${stickies} note${stickies === 1 ? "" : "s"}${groupProp ? ` · by ${groupProp.name}` : ""}`
	const empty = items.length === 0 && groups.length === 0 && !draft
	const name = (id: string) => data.resolvers.userName(id) ?? "Someone"

	return (
		<div className={"wb-wrap look-" + view.look}>
			<Toolbar
				title="Whiteboard"
				sub={sub}
				view={view}
				setView={setView}
				properties={properties}
				filtering={filtering}
				today={today}
				settings={settings}
				share={{
					block: "whiteboard",
					defaults: DEFAULT,
					schemas: itemsSrc.propertySchemasById,
					extra: { label: "Include my drawings and note colors", get: () => local, set: (v) => setLocal(() => readLocal(v)) },
					sanitize,
				}}
			/>
			<div className="wb-board">
			<div
				ref={rootRef}
				className="wb-root"
				style={{ height: view.height, ...(view.look === "cork" ? { backgroundPosition: `${pan[0]}px ${pan[1]}px` } : {}) }}
				data-tool={tool}
				data-panning={panDrag ? "true" : "false"}
				data-space={space ? "true" : "false"}
				role="application"
				aria-label="Whiteboard canvas"
				tabIndex={0}
				onPointerDown={onDown}
				onPointerMove={onMove}
				onPointerUp={onUp}
				onPointerCancel={onCancel}
				onLostPointerCapture={onCancel}
				onPointerLeave={() => setEraserAt(null)}
				onKeyDown={onKey}
				onKeyUp={(e) => e.code === "Space" && setSpace(false)}
			>
				<svg className="wb-canvas" aria-hidden="true">
					<g transform={`translate(${pan[0]} ${pan[1]}) scale(${scale})`}>
						{groups.map((g) => (
							<Frame
								key={g.id}
								g={g}
								hot={hoverFrame === g.id}
								onAdd={() => {
									const at = nextSlot(g, items.filter((it) => it.groupId === g.id && it.type === "sticky"))
									newSticky(at.x, at.y, g)
								}}
								onTidy={() => tidyFrame(g)}
							/>
						))}
						{sorted.map((it) =>
							it.type === "sticky" ? (
								<StickyView
									key={it.id}
									it={it}
									fill={fillOf(it)}
									tool={tool}
									selected={selectedId === it.id}
									editing={editingId === it.id}
									dragging={drag?.id === it.id && drag.moved}
									hidden={flying.some((f) => f.item.id === it.id) || party?.it.id === it.id}
									author={view.authors && it.authorIds.length ? it.authorIds.map(name) : null}
									pin={view.look === "cork"}
									onDown={onItemDown}
									onEdit={() => {
										setSelectedId(it.id)
										setEditingId(it.id)
									}}
									onCommit={commitText}
									onDone={canDone ? () => markDone(it, !it.done) : null}
								/>
							) : (
								<InkView key={it.id} it={it} tool={tool} selected={selectedId === it.id} onDown={onItemDown} />
							)
						)}
						<DraftView draft={draft} ink={ink} width={width} />
						{tool === "eraser" && eraserAt ? <circle cx={eraserAt[0]} cy={eraserAt[1]} r={radius} className="wb-eraser" /> : null}
					</g>
				</svg>

				{empty ? (
					<div className="wb-empty">
						<div className="wb-ghost" />
						<p>Grab the sticky tool (S) and put a thought on the wall.</p>
					</div>
				) : null}

				{flying.map((f) => (
					<div
						key={f.key}
						className="wb-fly"
						style={{ left: f.left, top: f.top, width: f.size, height: f.size, background: `var(--wb-fill-${f.color})`, "--dx": `${f.dx}px`, "--dy": `${f.dy}px`, "--r0": `${f.rot}deg` } as CSSProperties}
						onAnimationEnd={() => setFlying((xs) => xs.filter((x) => x.key !== f.key))}
					>
						<span style={{ fontSize: Math.max(9, 13 * scale) }}>{f.item.title}</span>
					</div>
				))}

				{canDone ? (
					<button
						type="button"
						key={eating}
						className={"wb-den wb-ui" + (flying.length ? " hungry" : "") + (view.showDone ? " showing" : "")}
						aria-pressed={view.showDone}
						aria-label={view.showDone ? "Hide done notes" : "Show done notes"}
						title={view.showDone ? "Hide done notes" : "The turtle eats done notes. Click to see them again."}
						onClick={() => setUi({ showDone: !view.showDone })}
					>
						<Turtle px={4} eating={eating > 0} />
					</button>
				) : null}

				{ask ? <FixNote it={ask} onCancel={() => setAsk(null)} onDone={(t) => finish(ask, t)} /> : null}

				<div className="wb-zoom wb-ui">
					<button type="button" aria-label="Zoom out" onClick={() => zoomStep(-1)}>
						−
					</button>
					<button type="button" className="wb-zoom-v" title="Fit everything (0)" onClick={fit}>
						{Math.round(scale * 100)}%
					</button>
					<button type="button" aria-label="Zoom in" onClick={() => zoomStep(1)}>
						+
					</button>
				</div>

				<ToolOptions
					tool={tool}
					ink={ink}
					fill={fill}
					width={width}
					radius={radius}
					selected={selected}
					topicColored={!!(selected?.groupId && view.byTopic)}
					onInk={setInk}
					onFill={setFill}
					onWidth={setWidth}
					onRadius={setRadius}
					onChange={(p) => selected && void save(selected, p)}
					onEdit={() => selected?.type === "sticky" && setEditingId(selected.id)}
					onDone={() => selected && markDone(selected, !selected.done)}
					onDelete={() => {
						if (selected) void remove(selected)
						setSelectedId(null)
					}}
				/>
				<ToolPill tool={tool} onTool={setTool} />

				{toast ? (
					<div className="wb-toast wb-ui" role="status">
						<span>{toast.text}</span>
						{toast.undo ? (
							<button
								type="button"
								onClick={() => {
									toast.undo?.()
									setToast(null)
								}}
							>
								Undo
							</button>
						) : null}
					</div>
				) : null}
			</div>
			</div>
			{party ? <Party it={party.it} text={party.text} today={doneToday} color={fillOf(party.it)} onClose={() => feed(party.it)} /> : null}
		</div>
	)
}

function Frame({ g, hot, onAdd, onTidy }: { g: Group; hot: boolean; onAdd: () => void; onTidy: () => void }) {
	return (
		<g className={"wb-frame" + (hot ? " hot" : "")} transform={`translate(${g.x} ${g.y})`}>
			<rect className="wb-frame-bg" width={g.w} height={g.h} rx={14} style={{ fill: `var(--wb-frame-${g.color})`, stroke: `var(--wb-ink-${g.color})` }} />
			<foreignObject width={g.w} height={FRAME_HEAD}>
				<div className="wb-frame-head">
					<span className="wb-tape" style={{ background: `var(--wb-fill-${g.color})` }} />
					<span className="wb-frame-t" title={g.name}>
						{g.name}
					</span>
					<span className="wb-frame-n">{g.count}</span>
					<span className="spacer" />
					<button type="button" className="wb-ui wb-fbtn" title="Tidy up: line the notes up in two columns" onClick={onTidy}>
						<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
							<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
							<rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
							<rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
							<rect x="9" y="9" width="4.5" height="4.5" rx="1" />
						</svg>
					</button>
					<button type="button" className="wb-ui wb-fbtn" title={`Add a note to ${g.name}`} onClick={onAdd}>
						<Plus />
					</button>
				</div>
			</foreignObject>
		</g>
	)
}

function stickyFont(len: number) {
	return len <= 40 ? { fontSize: 15, lineHeight: "20px" } : len <= 120 ? { fontSize: 13, lineHeight: "18px" } : { fontSize: 11.5, lineHeight: "15px" }
}

type StickyProps = {
	it: Item
	fill: Color
	tool: Tool
	selected: boolean
	editing: boolean
	dragging: boolean
	hidden: boolean
	author: string[] | null
	pin: boolean
	onDown: (e: RPointerEvent, it: Item) => void
	onEdit: () => void
	onCommit: (id: string, text: string) => void
	onDone: (() => void) | null
}

function StickyView({ it, fill, tool, selected, editing, dragging, hidden, author, pin, onDown, onEdit, onCommit, onDone }: StickyProps) {
	const [text, setText] = useState(it.title)
	const rot = stickyRotation(it.id)
	const pad = 24
	const live = tool === "select"
	const cls = ["wb-card", live ? "live" : "", selected ? "selected" : "", dragging ? "dragging" : "", it.done ? "done" : ""].filter(Boolean).join(" ")
	return (
		<g className={"wb-item" + (hidden ? " gone" : "")} transform={`translate(${it.x} ${it.y}) rotate(${rot.toFixed(2)} ${it.width / 2} ${it.height / 2})`} style={{ pointerEvents: live ? "auto" : "none" }}>
			<foreignObject x={-pad} y={-pad} width={it.width + pad * 2} height={it.height + pad * 2}>
				<div style={{ padding: pad, width: it.width, height: it.height, boxSizing: "content-box", pointerEvents: "none" }}>
					<div className={cls} style={{ pointerEvents: live ? "auto" : "none", background: `var(--wb-fill-${fill})` }} onPointerDown={(e) => onDown(e, it)} onDoubleClick={onEdit}>
						{pin ? <span className="wb-pin" style={{ background: `var(--wb-ink-${fill === "gray" ? "red" : fill})` }} /> : null}
						{editing ? (
							<textarea
								className="wb-text wb-input"
								style={stickyFont(text.length)}
								value={text}
								maxLength={500}
								placeholder="Type something…"
								autoFocus
								onFocus={(e) => {
									setText(it.title)
									e.currentTarget.setSelectionRange(it.title.length, it.title.length)
								}}
								onChange={(e) => setText(e.target.value)}
								onBlur={() => onCommit(it.id, text)}
								onPointerDown={(e) => e.stopPropagation()}
								onKeyDown={(e) => {
									if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
										e.preventDefault()
										e.currentTarget.blur()
									}
									e.stopPropagation()
								}}
							/>
						) : (
							<div className="wb-text" style={stickyFont(it.title.length)}>
								{it.title}
								{it.done && it.resolution ? <span className="wb-fix">✓ {it.resolution}</span> : null}
							</div>
						)}
						<div className="wb-foot">
							{author ? (
								<span className="wb-by" title={`Written by ${author.join(", ")}`}>
									<span className="wb-av">{initials(author[0])}</span>
									{firstName(author[0])}
									{author.length > 1 ? ` +${author.length - 1}` : ""}
								</span>
							) : (
								<span />
							)}
							{onDone ? (
								<button
									type="button"
									className={"wb-check" + (it.done ? " on" : "")}
									role="checkbox"
									aria-checked={it.done}
									aria-label={it.done ? "Mark as not done" : "Mark as done"}
									title={it.done ? "Not done after all" : "Done! Bin it"}
									onPointerDown={(e) => e.stopPropagation()}
									onClick={(e) => {
										e.stopPropagation()
										onDone()
									}}
								>
									<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
										<path d="M3.5 8.5l3 3 6-7" />
									</svg>
								</button>
							) : null}
						</div>
					</div>
				</div>
			</foreignObject>
		</g>
	)
}

function InkView({ it, tool, selected, onDown }: { it: Item; tool: Tool; selected: boolean; onDown: (e: RPointerEvent, it: Item) => void }) {
	const abs = it.points.map(([px, py]) => [px + it.x, py + it.y] as Point)
	const ink = `var(--wb-ink-${it.color})`
	const live = tool === "select"
	return (
		<g className="wb-item" style={{ pointerEvents: live ? "auto" : "none" }}>
			{it.type === "arrow" && abs.length >= 2 ? <Arrow start={abs[0]} end={abs[abs.length - 1]} ink={ink} w={it.strokeWidth} /> : <path d={smoothPath(abs)} stroke={ink} strokeWidth={it.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
			<path d={smoothPath(abs)} stroke="transparent" strokeWidth={Math.max(14, it.strokeWidth + 10)} fill="none" style={{ pointerEvents: live ? "stroke" : "none", cursor: "move" }} onPointerDown={(e) => onDown(e, it)} />
			{selected ? <rect x={it.x - 6} y={it.y - 6} width={it.width + 12} height={it.height + 12} rx={4} className="wb-selbox" /> : null}
		</g>
	)
}

function Arrow({ start, end, ink, w }: { start: Point; end: Point; ink: string; w: number }) {
	const head = Math.max(9, w * 2.5 + 4)
	const len = Math.hypot(end[0] - start[0], end[1] - start[1])
	const t = len > 0 ? Math.max(0, (len - head * 0.6) / len) : 0
	const shaft: Point = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]
	const [a, b] = arrowHead(start, end, head)
	return (
		<>
			<path d={`M ${start[0]} ${start[1]} L ${shaft[0]} ${shaft[1]}`} stroke={ink} strokeWidth={w} fill="none" strokeLinecap="round" />
			<polygon points={`${end[0]},${end[1]} ${a[0]},${a[1]} ${b[0]},${b[1]}`} fill={ink} stroke={ink} strokeWidth={1} strokeLinejoin="round" />
		</>
	)
}

function DraftView({ draft, ink, width }: { draft: Draft | null; ink: Color; width: number }): ReactNode {
	if (!draft) return null
	const c = `var(--wb-ink-${ink})`
	if (draft.kind === "pen") return <path d={smoothPath(draft.points)} stroke={c} strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
	if (draft.kind === "arrow")
		return (
			<g style={{ pointerEvents: "none" }}>
				<Arrow start={draft.start} end={draft.end} ink={c} w={width} />
			</g>
		)
	return <path d={`M ${draft.start[0]} ${draft.start[1]} L ${draft.end[0]} ${draft.end[1]}`} stroke={c} strokeWidth={width} strokeLinecap="round" style={{ pointerEvents: "none" }} />
}

/** Asks how the note was fixed; the text is prefilled from the property and stays editable. */
function FixNote({ it, onCancel, onDone }: { it: Item; onCancel: () => void; onDone: (text: string) => void }) {
	const [text, setText] = useState(it.resolution)
	return (
		<div className="wb-ask-bg wb-ui" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
			<form
				className="wb-ask"
				onSubmit={(e) => {
					e.preventDefault()
					onDone(text)
				}}
			>
				<div className="wb-ask-note">{it.title || "Untitled note"}</div>
				<label className="wb-ask-l" htmlFor="wb-fix">
					How was it fixed?
				</label>
				<textarea
					id="wb-fix"
					autoFocus
					rows={3}
					maxLength={2000}
					value={text}
					placeholder="A line for future you: what did the trick?"
					onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
							e.preventDefault()
							onDone(text)
						}
						if (e.key === "Escape") onCancel()
						e.stopPropagation()
					}}
				/>
				<div className="wb-ask-b">
					<button type="button" className="wb-btn" onClick={onCancel}>
						Not yet
					</button>
					<button type="submit" className="wb-btn primary">
						Done ✓
					</button>
				</div>
			</form>
		</div>
	)
}

const CHEERS = [
	["Fixed it!", "Slow and steady ships the product."],
	["Nailed it!", "One less thing on the wall. The turtle is proud of you."],
	["Done and dusted!", "That's how connections that work get made."],
	["Boom. Shipped.", "Somewhere a backlog just got lighter."],
	["Look at you go!", "Small wins stack up. This was one."],
	["Resolved!", "Future you says thanks for writing it down."],
]

/** The full-screen moment: confetti in ecosio colors and a dancing turtle. Click or wait to continue. */
function Party({ it, text, today, color, onClose }: { it: Item; text: string; today: number; color: Color; onClose: () => void }) {
	const [title, line] = useMemo(() => CHEERS[Math.floor(Math.random() * CHEERS.length)], [])
	const bits = useMemo(
		() =>
			Array.from({ length: 70 }, (_, i) => ({
				left: Math.random() * 100,
				delay: Math.random() * 0.6,
				dur: 1.6 + Math.random() * 1.4,
				size: 6 + Math.round(Math.random() * 3) * 3,
				color: ["#0054FF", "#6FD44E", "#FFFFFF", "#5B8CFF", "#2A4EEF", "#F2F6FF"][i % 6],
				drift: (Math.random() - 0.5) * 160,
			})),
		[]
	)
	const done = useRef(onClose)
	done.current = onClose
	useEffect(() => {
		const t = window.setTimeout(() => done.current(), 3400)
		const k = (e: KeyboardEvent) => (e.key === "Escape" || e.key === "Enter" || e.key === " ") && done.current()
		window.addEventListener("keydown", k)
		return () => {
			window.clearTimeout(t)
			window.removeEventListener("keydown", k)
		}
	}, [])
	return (
		<div className="wb-party" role="dialog" aria-live="assertive" aria-label={title} onClick={() => done.current()}>
			{bits.map((b, i) => (
				<span
					key={i}
					className="wb-bit"
					style={{ left: `${b.left}%`, width: b.size, height: b.size, background: b.color, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, "--drift": `${b.drift}px` } as CSSProperties}
				/>
			))}
			<div className="wb-party-in">
				<Turtle px={12} dancing />
				<h2>{title}</h2>
				<p className="wb-party-line">{line}</p>
				<div className="wb-party-note" style={{ background: `var(--wb-fill-${color})` }}>
					<b>{it.title || "Untitled note"}</b>
					{text ? <span>✓ {text}</span> : null}
				</div>
				{today > 1 ? <p className="wb-party-count">{today} in a row. Keep going!</p> : null}
				<p className="wb-party-hint">Click anywhere to feed the turtle</p>
			</div>
		</div>
	)
}
