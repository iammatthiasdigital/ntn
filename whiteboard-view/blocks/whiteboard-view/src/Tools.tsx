/**
 * The floating tool pill and the options row above it (colors, widths,
 * eraser size, or the selected item's properties).
 */
import type { ReactNode } from "react"
import { INK_COLORS, STICKY_COLORS, type Color, type Item } from "./board"
import { ArrowIcon, EraserIcon, HandIcon, LineIcon, PenIcon, SelectIcon, StickyIcon } from "./icons"

export type Tool = "select" | "hand" | "pen" | "eraser" | "sticky" | "line" | "arrow"

export const STROKE_WIDTHS = [2, 4, 7] as const
export const ERASER_RADII = [8, 16, 32] as const

export const TOOL_KEYS: Record<string, Tool> = { v: "select", h: "hand", p: "pen", e: "eraser", s: "sticky", l: "line", a: "arrow" }

const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
	{ id: "select", label: "Select", key: "V", icon: <SelectIcon /> },
	{ id: "hand", label: "Pan", key: "H", icon: <HandIcon /> },
	{ id: "sticky", label: "Sticky note", key: "S", icon: <StickyIcon /> },
	{ id: "pen", label: "Pen", key: "P", icon: <PenIcon /> },
	{ id: "line", label: "Line", key: "L", icon: <LineIcon /> },
	{ id: "arrow", label: "Arrow", key: "A", icon: <ArrowIcon /> },
	{ id: "eraser", label: "Eraser", key: "E", icon: <EraserIcon /> },
]

export function ToolPill({ tool, onTool }: { tool: Tool; onTool: (t: Tool) => void }) {
	return (
		<div className="wb-pill wb-ui" role="toolbar" aria-label="Whiteboard tools">
			{TOOLS.map((t) => (
				<button key={t.id} type="button" className="wb-tool" aria-pressed={tool === t.id} aria-label={`${t.label} (${t.key})`} aria-keyshortcuts={t.key} title={`${t.label} · ${t.key}`} onClick={() => onTool(t.id)}>
					{t.icon}
				</button>
			))}
		</div>
	)
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const WIDTH_DOT: Record<number, number> = { 2: 4, 4: 7, 7: 10 }
const RADIUS_DOT: Record<number, number> = { 8: 8, 16: 12, 32: 17 }

function Swatches({ colors, value, kind, onPick }: { colors: Color[]; value: Color; kind: "fill" | "ink"; onPick: (c: Color) => void }) {
	return (
		<>
			{colors.map((c) => (
				<button key={c} type="button" className="wb-opt" aria-pressed={value === c} aria-label={kind === "ink" && c === "gray" ? "Ink" : cap(c)} title={kind === "ink" && c === "gray" ? "Ink" : cap(c)} onClick={() => onPick(c)}>
					<span className={"wb-dot " + kind} style={{ background: `var(--wb-${kind}-${c})` }} />
				</button>
			))}
		</>
	)
}

function Widths({ value, onPick }: { value: number; onPick: (w: number) => void }) {
	return (
		<>
			{STROKE_WIDTHS.map((w) => (
				<button key={w} type="button" className="wb-opt" aria-pressed={value === w} aria-label={`${w}px stroke`} title={`${w}px stroke`} onClick={() => onPick(w)}>
					<span className="wb-wdot" style={{ width: WIDTH_DOT[w], height: WIDTH_DOT[w] }} />
				</button>
			))}
		</>
	)
}

type OptionsProps = {
	tool: Tool
	ink: Color
	fill: Color
	width: number
	radius: number
	selected: Item | null
	/** The selected sticky takes its color from its frame. */
	topicColored: boolean
	onInk: (c: Color) => void
	onFill: (c: Color) => void
	onWidth: (w: number) => void
	onRadius: (r: number) => void
	onChange: (patch: Partial<Item>) => void
	onEdit: () => void
	onDone: () => void
	onDelete: () => void
}

export function ToolOptions(p: OptionsProps) {
	let body: ReactNode = null
	if (p.tool === "select" && p.selected?.type === "sticky") {
		const s = p.selected
		body = (
			<>
				<button type="button" className="wb-opt wb-opt-l" onClick={p.onEdit}>
					Edit
				</button>
				<button type="button" className="wb-opt wb-opt-l" onClick={p.onDone}>
					{s.done ? "Not done" : "Done ✓"}
				</button>
				<span className="wb-sep" />
				{p.topicColored ? <span className="wb-opt-note">Frame color</span> : <Swatches colors={STICKY_COLORS} value={s.color} kind="fill" onPick={(c) => p.onChange({ color: c })} />}
				<span className="wb-sep" />
				<button type="button" className="wb-opt wb-opt-l danger" onClick={p.onDelete}>
					Delete
				</button>
			</>
		)
	} else if (p.tool === "select" && p.selected) {
		const s = p.selected
		body = (
			<>
				<Swatches colors={INK_COLORS} value={s.color} kind="ink" onPick={(c) => p.onChange({ color: c })} />
				<span className="wb-sep" />
				<Widths value={s.strokeWidth} onPick={(w) => p.onChange({ strokeWidth: w })} />
				<span className="wb-sep" />
				<button type="button" className="wb-opt wb-opt-l danger" onClick={p.onDelete}>
					Delete
				</button>
			</>
		)
	} else if (p.tool === "sticky") {
		body = (
			<>
				<span className="wb-opt-note">Click to stick · inside a frame it takes the frame's color</span>
				<span className="wb-sep" />
				<Swatches colors={STICKY_COLORS} value={p.fill} kind="fill" onPick={p.onFill} />
			</>
		)
	} else if (p.tool === "eraser") {
		body = ERASER_RADII.map((r) => (
			<button key={r} type="button" className="wb-opt" aria-pressed={p.radius === r} aria-label={`Eraser ${r}px`} title={`Eraser ${r}px`} onClick={() => p.onRadius(r)}>
				<span className="wb-edot" style={{ width: RADIUS_DOT[r], height: RADIUS_DOT[r] }} />
			</button>
		))
	} else if (p.tool === "pen" || p.tool === "line" || p.tool === "arrow") {
		body = (
			<>
				<Swatches colors={INK_COLORS} value={p.ink} kind="ink" onPick={p.onInk} />
				<span className="wb-sep" />
				<Widths value={p.width} onPick={p.onWidth} />
			</>
		)
	}
	if (!body) return null
	return (
		<div className="wb-options wb-ui" role="toolbar" aria-label="Tool options">
			{body}
		</div>
	)
}
