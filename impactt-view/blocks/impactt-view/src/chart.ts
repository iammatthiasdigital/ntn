/**
 * Imperative SVG renderer for the Impactt chart, ported from the standalone
 * artifact. It owns the scrolling stage, the fixed y-axis overlay, the
 * tooltip, and hover/pin highlighting; React owns everything around it and
 * mirrors the active bar through `onActive`.
 */
import {
	clamp,
	fmt,
	fmtD,
	fmtMo,
	MON,
	MONTH,
	niceMax,
	tickLabel,
	type Dataset,
	type Goal,
	type Item,
	type Kpi,
	type Model,
	type Time,
	type TimeUnit,
} from "./model"

export type RangeKey = "1M" | "3M" | "6M" | "1Y" | "2Y" | "all"
export type LineKey = "plan" | "actual" | "proj" | "band" | "goal"

export type ChartUI = {
	unit: TimeUnit
	range: RangeKey
	/** Left edge of the visible window, in model months; null = auto. */
	scrollT: number | null
	compare: boolean
	lines: Record<LineKey, boolean>
}

export type ChartInput = {
	D: Dataset
	time: Time
	k: Kpi
	M: Model
	G: Goal
	S: { t0: number; t1: number }
	ui: ChartUI
}

export const RANGES: Partial<Record<RangeKey, number>> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "2Y": 24 }
export const AUTO_UNIT: Record<RangeKey, TimeUnit> = {
	"1M": "days",
	"3M": "weeks",
	"6M": "weeks",
	"1Y": "months",
	"2Y": "quarters",
	all: "months",
}

const NS = "http://www.w3.org/2000/svg"
type Attrs = Record<string, string | number>

function el(tag: string, a: Attrs, p?: Element): SVGElement {
	const e = document.createElementNS(NS, tag) as SVGElement
	for (const k in a) e.setAttribute(k, String(a[k]))
	if (p) p.appendChild(e)
	return e
}
function txt(p: Element, a: Attrs, s: string | number): SVGTextElement {
	const t = el("text", a, p) as SVGTextElement
	t.textContent = String(s)
	return t
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

type Els = {
	board: HTMLElement
	wrap: HTMLElement
	scroller: HTMLElement
	stage: SVGSVGElement
	over: SVGSVGElement
	tip: HTMLElement
	curmonth: HTMLElement
}

type Cur = ChartInput & {
	x: (t: number) => number
	y: (v: number) => number
	T0: number
	T1: number
	ppm: number
	L: number
	R: number
	VW: number
}

export class ImpactChart {
	private els: Els
	private cur: Cur | null = null
	private hov: string | null = null
	private pin: string | null = null
	private sticky: { els: SVGTextElement[]; bx: number; bw: number; w: number }[] = []
	private syncing = false
	private dragging = false
	private dragMoved = false
	private dragX = 0
	private dragS = 0
	private cleanup: (() => void)[] = []

	constructor(
		els: Els,
		private cb: { onActive: (id: string | null) => void; onScroll: (t: number) => void }
	) {
		this.els = els
		const { scroller } = els
		const onScroll = () => {
			if (this.syncing || !this.cur) return
			this.cur.ui.scrollT = this.cur.T0 + scroller.scrollLeft / this.cur.ppm
			this.cb.onScroll(this.cur.ui.scrollT)
			this.updMonth()
			this.stickLabels()
			if (this.pin != null) {
				const o = this.find(this.pin)
				if (o) this.placeTipFor(o, true)
			}
		}
		const onDown = (e: PointerEvent) => {
			if (e.pointerType !== "mouse" || e.button !== 0) return
			this.dragging = true
			this.dragMoved = false
			this.dragX = e.clientX
			this.dragS = scroller.scrollLeft
		}
		const onMove = (e: PointerEvent) => {
			if (!this.dragging) return
			const dx = e.clientX - this.dragX
			if (Math.abs(dx) > 4) {
				this.dragMoved = true
				scroller.classList.add("drag")
			}
			if (this.dragMoved) scroller.scrollLeft = this.dragS - dx
		}
		const onUp = () => {
			if (!this.dragging) return
			this.dragging = false
			scroller.classList.remove("drag")
			setTimeout(() => (this.dragMoved = false), 0)
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && this.pin != null) this.setPin(null)
		}
		scroller.addEventListener("scroll", onScroll)
		scroller.addEventListener("pointerdown", onDown)
		window.addEventListener("pointermove", onMove)
		window.addEventListener("pointerup", onUp)
		document.addEventListener("keydown", onKey)
		this.cleanup.push(
			() => scroller.removeEventListener("scroll", onScroll),
			() => scroller.removeEventListener("pointerdown", onDown),
			() => window.removeEventListener("pointermove", onMove),
			() => window.removeEventListener("pointerup", onUp),
			() => document.removeEventListener("keydown", onKey)
		)
	}

	destroy(): void {
		for (const f of this.cleanup) f()
	}

	get active(): string | null {
		return this.pin ?? this.hov
	}

	private find(id: string): Item | undefined {
		return this.cur?.M.list.find((o) => o.id === id)
	}

	scrollBy(dir: -1 | 1): void {
		if (!this.cur) return
		this.els.scroller.scrollBy({ left: (dir * (this.cur.VW - this.cur.L - this.cur.R)) / 2, behavior: "smooth" })
	}

	render(input: ChartInput): void {
		const { svg, over, scroller } = { svg: this.els.stage, over: this.els.over, scroller: this.els.scroller }
		const { M, G, S, k, time, ui } = input
		const T = M.T
		const VW = Math.max(320, this.els.wrap.clientWidth)
		const narrow = VW < 640
		const L = narrow ? 42 : 58
		const R = 16
		const hdr = 40
		const top = hdr + 12
		const CH = narrow ? 360 : 480
		const H = top + CH + 10
		const VPW = VW - L - R
		const Rm = RANGES[ui.range]
		const T0 = Rm ? Math.min(S.t0, Math.floor(T - Rm)) : S.t0
		const T1 = Rm ? Math.max(S.t1, Math.ceil(T + Rm)) : S.t1
		const ppm = Rm ? VPW / Rm : VPW / (T1 - T0)
		const PW = (T1 - T0) * ppm
		const SW = L + PW + R
		const x = (t: number) => L + (t - T0) * ppm
		const sp = k.spread ?? 0.3
		const yMax = niceMax(Math.max(M.hi, M.planTotal, k.base, M.projAt(T1, 1 + sp), G.value))
		const yMin = 0
		const y = (v: number) => top + CH - ((v - yMin) / (yMax - yMin)) * CH
		this.cur = { ...input, x, y, T0, T1, ppm, L, R, VW }
		if (this.pin && !this.find(this.pin)) this.pin = null
		if (this.hov && !this.find(this.hov)) this.hov = null

		svg.setAttribute("width", String(SW))
		svg.setAttribute("height", String(H))
		svg.setAttribute("viewBox", `0 0 ${SW} ${H}`)
		svg.innerHTML = ""
		over.setAttribute("width", String(VW))
		over.setAttribute("height", String(H))
		over.setAttribute("viewBox", `0 0 ${VW} ${H}`)
		over.innerHTML = ""

		/* header + columns */
		const g0 = el("g", { "pointer-events": "none" }, svg)
		const tk = time.ticks(ui.unit, T0, T1)
		const minPx = { days: 18, weeks: 28, months: 26, quarters: 28, years: 36 }[ui.unit]
		const colW = tk.length > 1 ? (tk[1].b - tk[1].a) * ppm : PW
		const stride = Math.max(1, Math.ceil(minPx / Math.max(1, colW)))
		tk.forEach((c, j) => {
			const xa = x(c.a)
			const xb = x(c.b)
			const shade = ui.unit === "days" ? c.d.getDay() === 0 || c.d.getDay() === 6 : j % 2
			if (shade) el("rect", { x: xa, y: hdr + 2, width: xb - xa, height: CH + 10, fill: "var(--col)" }, g0)
			if (j % stride === 0)
				txt(
					g0,
					{
						x: (xa + x(Math.min(T1, c.a + (c.b - c.a) * stride))) / 2,
						y: hdr - 4,
						"text-anchor": "middle",
						"font-size": 12,
						fill: "var(--muted)",
						class: ui.unit === "days" || ui.unit === "weeks" ? "num" : "",
					},
					tickLabel(ui.unit, c.d, colW * stride)
				)
		})
		const grpU: TimeUnit | null = ui.unit === "days" || ui.unit === "weeks" ? "months" : ui.unit === "years" ? null : "years"
		if (grpU)
			time.ticks(grpU, T0, T1).forEach((c) => {
				const xa = Math.max(L, x(c.a))
				if (x(c.a) > L) el("line", { x1: x(c.a), x2: x(c.a), y1: 0, y2: top + CH, stroke: "var(--line)" }, g0)
				if (x(c.b) - xa > 40)
					txt(
						g0,
						{ x: xa + 6, y: 12, "font-size": 12, "font-weight": 500, fill: "var(--ink2)" },
						grpU === "months" ? `${MON[c.d.getMonth()]} ${c.d.getFullYear()}` : String(c.d.getFullYear())
					)
			})
		el("line", { x1: L, x2: SW - R, y1: hdr + 2, y2: hdr + 2, stroke: "var(--line)" }, g0)
		for (let t = 0; t <= 5; t++) {
			const yy = y(yMin + ((yMax - yMin) * t) / 5)
			el("line", { x1: L, x2: SW - R, y1: yy, y2: yy, stroke: t ? "var(--grid)" : "var(--line)" }, g0)
		}
		if (k.base)
			el(
				"line",
				{ x1: L, x2: SW - R, y1: y(k.base), y2: y(k.base), stroke: "var(--ink2)", "stroke-width": 1, "stroke-dasharray": "1 2", opacity: 0.6 },
				g0
			)

		const ov = el("rect", { x: L, y: top, width: PW, height: CH, fill: "transparent" }, svg)
		ov.addEventListener("click", () => {
			if (!this.dragMoved) this.setPin(null)
		})

		/* totals behind bars */
		const line = (a: number, b: number, f: (t: number) => number) => {
			if (b <= a) return ""
			let d = ""
			const st = Math.max(2, Math.round((b - a) * 30))
			for (let s = 0; s <= st; s++) {
				const t = a + ((b - a) * s) / st
				d += (s ? "L" : "M") + x(t).toFixed(1) + " " + y(f(t)).toFixed(1)
			}
			return d
		}
		const lg = el("g", { "pointer-events": "none" }, svg)
		if (ui.lines.band) {
			const up = line(T, T1, (t) => M.projAt(t, 1 + sp))
			const dn = line(T, T1, (t) => M.projAt(t, 1 - sp))
			if (up && dn) el("path", { d: up + "L" + dn.slice(1).split("L").reverse().join("L") + "Z", fill: "var(--band)" }, lg)
		}
		if (ui.lines.plan)
			el("path", { d: line(T0, T1, M.planAt), fill: "none", stroke: "var(--tplan)", "stroke-width": 1.2, "stroke-dasharray": "2 4", "stroke-linecap": "round" }, lg)
		if (ui.lines.proj)
			el("path", { d: line(T, T1, (t) => M.projAt(t)), fill: "none", stroke: "var(--tproj)", "stroke-width": 1.2, "stroke-dasharray": "5 4" }, lg)
		if (ui.lines.actual)
			el("path", { d: line(T0, T, M.actAt), fill: "none", stroke: "var(--tact)", "stroke-width": 2.2, "stroke-linejoin": "round" }, lg)

		/* bars */
		const act = this.active
		this.sticky = []
		const blocks = el("g", { class: (act != null ? "dim " : "") + (ui.compare ? "compare" : ""), "data-blocks": "" }, svg)
		M.list.forEach((o) => {
			const c = o.color
			const g = el(
				"g",
				{ class: "blk" + (act === o.id ? " on" : ""), tabindex: 0, role: "button", "aria-label": `${o.it.name}: ${o.status}`, "data-id": o.id },
				blocks
			)
			const rect = (a: number, b: number, v0: number, v1: number, at: Attrs, p: Element = g) => {
				const ya = y(v0)
				const yb = y(v1)
				return el(
					"rect",
					Object.assign({ x: x(a), y: Math.min(ya, yb), width: Math.max(2, x(b) - x(a)), height: Math.max(2, Math.abs(ya - yb)), rx: 5 }, at),
					p
				)
			}
			const PLAN = { fill: c, "fill-opacity": 0.14, stroke: c, "stroke-width": 1.4, "stroke-opacity": 1 }
			const SOLID = { fill: c }
			const DASH = { fill: "none", stroke: c, "stroke-width": 0.9, "stroke-dasharray": "4 3" }
			const b0 = o.base
			let lab: { a: number; b: number; v: number; on?: boolean }
			if (o.state === "done") {
				rect(o.pa, o.pe, b0, b0 + o.P, PLAN, el("g", { class: "hov", "pointer-events": "none" }, g))
				rect(o.sa, o.ea, b0, b0 + o.N, SOLID)
				lab = { a: o.sa, b: o.ea, v: b0 + o.N, on: true }
			} else if (o.state === "planned") {
				rect(o.pa, o.pe, b0, b0 + o.P, PLAN)
				lab = { a: o.pa, b: o.pe, v: b0 + o.P }
			} else {
				rect(o.pa, o.pe, b0, b0 + o.P, PLAN)
				if (Math.abs(o.N) > 0) rect(o.sa, Math.min(T, o.pend), b0, b0 + o.N, SOLID)
				if (o.timing === "fixed") rect(Math.min(o.pa, o.sa), o.pe, b0, b0 + o.proj, DASH)
				else rect(Math.min(o.pa, o.sa), o.pend, b0, b0 + o.P, DASH)
				lab = { a: o.pa, b: o.pe, v: b0 + (Math.abs(o.proj) > Math.abs(o.P) ? o.proj : o.P) }
			}
			/* labels */
			const bx = x(lab.a)
			const bw = x(lab.b) - bx
			const bt = Math.min(y(lab.v), y(b0))
			const bh = Math.abs(y(lab.v) - y(b0))
			const devTxt =
				o.state === "planned"
					? "upcoming"
					: o.state === "done"
						? o.st === "late"
							? `late ${fmtMo(o.dT)}`
							: Math.abs(o.dImp) < 1e-9
								? "as planned"
								: `${fmtD(o.dImp, k.fmt)} vs plan`
						: o.timing === "fixed"
							? Math.abs(o.dImp) / Math.abs(o.P || 1) < 0.02
								? "on plan"
								: `${fmtD(o.dImp, k.fmt)} vs plan`
							: fmtMo(o.dT)
			const sh = Math.abs(y(b0 + o.N) - y(b0))
			const labAtSolid = y(b0 + o.P) > y(b0) ? sh >= 28 : sh >= bh - 4
			const solidUnder = lab.on || (o.state === "active" && labAtSolid && x(o.sa) <= bx + 4)
			const tc = solidUnder ? "var(--onfill)" : "var(--ink)"
			const tc2 = solidUnder ? "var(--onfill)" : "var(--ink2)"
			/* Inside when the bar fits a two-line label (text shortened with "…");
			 * otherwise name and info go outside, beside the bar. */
			const MIN = 4
			const fit = (t: SVGTextElement, full: string, max: number): boolean => {
				let str = full
				while (t.getComputedTextLength() > max && str.length > MIN) {
					str = str.slice(0, -1)
					t.textContent = str.trimEnd() + "…"
				}
				return t.getComputedTextLength() <= max
			}
			let inside = false
			if (bh >= 28 && bw >= 40) {
				const n = txt(g, { x: bx + 7, y: bt + 14, "font-size": 12, "font-weight": 500, fill: tc, "pointer-events": "none" }, o.it.name)
				if (fit(n, o.it.name, bw - 12)) {
					inside = true
					const els = [n]
					const d = txt(
						g,
						{ x: bx + 7, y: bt + 26, "font-size": 11, "font-weight": 400, fill: tc2, class: "num", "pointer-events": "none", opacity: 0.92 },
						devTxt
					)
					if (fit(d, devTxt, bw - 12)) els.push(d)
					else d.remove()
					this.sticky.push({ els, bx, bw, w: Math.max(...els.map((e) => e.getComputedTextLength())) })
				} else n.remove()
			}
			if (!inside) {
				// Beside the bar's full visible extent (plan, actual and projection).
				const right = x(Math.max(lab.b, o.pe, o.state === "active" ? o.pend : lab.b, o.state === "done" ? o.ea : lab.b))
				const left = x(Math.min(lab.a, o.pa, o.sa))
				const cy = bt + bh / 2 + 4
				const t = txt(g, { x: right + 6, y: cy, "font-size": 12, fill: "var(--ink)", class: "halo", "pointer-events": "none" }, "")
				const nm = el("tspan", { "font-weight": 500 }, t)
				nm.textContent = o.it.name
				const info = el("tspan", { fill: "var(--ink2)", class: "num" }, t)
				info.textContent = ` · ${devTxt}`
				const w = t.getComputedTextLength()
				if (right + 6 + w > SW - R - 2) {
					if (left - 6 - w >= L + 2) {
						t.setAttribute("x", String(left - 6))
						t.setAttribute("text-anchor", "end")
					} else {
						// No room on either side: above the bar.
						t.setAttribute("x", String(Math.max(L + 4, Math.min(bx, SW - R - w - 2))))
						t.setAttribute("y", String(bt - 5))
					}
				}
			}
			g.addEventListener("mouseenter", () => {
				if (this.pin == null) {
					this.setHov(o.id)
					this.placeTipFor(o, false)
				}
			})
			g.addEventListener("mouseleave", () => {
				if (this.pin == null) {
					this.setHov(null)
					this.hideTip()
				}
			})
			g.addEventListener("click", (e) => {
				e.stopPropagation()
				if (!this.dragMoved) this.setPin(this.pin === o.id ? null : o.id)
			})
			g.addEventListener("keydown", (e) => {
				const ke = e as KeyboardEvent
				if (ke.key === "Enter" || ke.key === " ") {
					ke.preventDefault()
					this.setPin(this.pin === o.id ? null : o.id)
				}
			})
			g.addEventListener("focus", () => {
				if (this.pin == null) {
					this.setHov(o.id)
					this.placeTipFor(o, false)
				}
			})
			g.addEventListener("blur", () => {
				if (this.pin == null) {
					this.setHov(null)
					this.hideTip()
				}
			})
		})

		/* foreground in the scrolling layer */
		const fg = el("g", { "pointer-events": "none" }, svg)
		if (ui.lines.actual) el("circle", { cx: x(T), cy: y(M.actAt(T)), r: 4.5, fill: "var(--tact)", stroke: "var(--panel)", "stroke-width": 2 }, fg)
		if (ui.lines.goal) {
			const gx = x(G.by)
			const gy = y(G.value)
			el("line", { x1: L, x2: gx, y1: gy, y2: gy, stroke: "var(--goal)", "stroke-width": 1.1, "stroke-dasharray": "7 4" }, fg)
			el(
				"path",
				{ d: `M${gx} ${gy - 10} L${gx} ${gy + 1} M${gx} ${gy - 10} L${gx + 9} ${gy - 7} L${gx} ${gy - 4}`, fill: "var(--goal)", stroke: "var(--goal)", "stroke-width": 1.5, "stroke-linejoin": "round" },
				fg
			)
			const py = y(G.proj)
			const bx = gx - 6
			const cc = G.gap < 0 ? "var(--bad)" : "var(--good)"
			el("line", { x1: bx, x2: bx, y1: gy, y2: py, stroke: cc, "stroke-width": 2 }, fg)
			;[gy, py].forEach((v) => el("line", { x1: bx - 4, x2: bx + 4, y1: v, y2: v, stroke: cc, "stroke-width": 2 }, fg))
			el("circle", { cx: gx, cy: py, r: 4, fill: "var(--tproj)", stroke: "var(--panel)", "stroke-width": 2 }, fg)
			const ly = gy + (py > gy ? -8 : 16)
			const diff = Math.abs(G.proj - G.value)
			txt(
				fg,
				{ x: bx - 8, y: ly, "text-anchor": "end", "font-size": 12, "font-weight": 600, fill: cc, class: "halo num" },
				`Projected ${fmt(G.proj, k.fmt)} · ${fmtD(diff, k.fmt).replace(/^[+−]/, "")} ${k.kind === "effort" ? (G.gap < 0 ? "over budget" : "under budget") : G.gap < 0 ? "short" : "ahead"}`
			)
		}
		const tX = x(T)
		el("line", { x1: tX, x2: tX, y1: hdr + 2, y2: top + CH, stroke: "var(--today)", "stroke-width": 1 }, fg)
		if (ui.unit === "days") {
			const dd = time.toDate(T)
			const ta = time.fromDate(new Date(dd.getFullYear(), dd.getMonth(), dd.getDate()))
			const tb = time.fromDate(new Date(dd.getFullYear(), dd.getMonth(), dd.getDate() + 1))
			const cx = (x(ta) + x(tb)) / 2
			el("circle", { cx, cy: hdr - 8, r: 11, fill: "var(--today)" }, fg)
			txt(fg, { x: cx, y: hdr - 4, "text-anchor": "middle", "font-size": 12, "font-weight": 600, fill: "#fff" }, dd.getDate())
		}
		el("circle", { cx: tX, cy: hdr + 3, r: 3.5, fill: "var(--today)" }, fg)

		/* fixed overlay: y-axis and goal label stay put while scrolling */
		el("rect", { x: 0, y: 0, width: L, height: H, fill: "var(--panel)" }, over)
		el("line", { x1: L, x2: L, y1: hdr + 2, y2: top + CH, stroke: "var(--line)" }, over)
		for (let t = 0; t <= 5; t++) {
			const v = yMin + ((yMax - yMin) * t) / 5
			txt(over, { x: L - 8, y: y(v) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--muted)", class: "num" }, fmt(v, k.fmt))
		}
		if (k.base) {
			const near = [0, 1, 2, 3, 4, 5].some((t) => Math.abs(y(yMin + ((yMax - yMin) * t) / 5) - y(k.base)) < 12)
			if (!near)
				txt(over, { x: L - 8, y: y(k.base) + 4, "text-anchor": "end", "font-size": 11, "font-weight": 600, fill: "var(--ink2)", class: "num" }, fmt(k.base, k.fmt))
		}
		if (ui.lines.goal)
			txt(
				over,
				{ x: L + 8, y: y(G.value) - 7, "font-size": 12, "font-weight": 600, fill: "var(--goal)", class: "halo" },
				`${k.kind === "effort" ? "Budget" : "Goal"} ${fmt(G.value, k.fmt)}${G.mode === "plan" ? " (from plan)" : ""} by ${time.monthYear(G.by - 0.01)}`
			)

		/* crosshair */
		const cross = el("line", { y1: top, y2: top + CH, stroke: "var(--ink2)", opacity: 0, "pointer-events": "none" }, svg)
		ov.addEventListener("mousemove", (ev) => {
			const me = ev as MouseEvent
			if (this.pin != null || this.dragging) return
			const r = svg.getBoundingClientRect()
			const t = clamp(T0 + (me.clientX - r.left - L) / ppm, T0, T1)
			cross.setAttribute("x1", String(x(t)))
			cross.setAttribute("x2", String(x(t)))
			cross.setAttribute("opacity", "0.35")
			const dd = time.toDate(t)
			let h = `<b>${dd.getDate()} ${MON[dd.getMonth()]} ${dd.getFullYear()}</b><div><span>Plan</span><span>${fmt(M.planAt(t), k.fmt)}</span></div>`
			h +=
				t <= T
					? `<div><span>Actual</span><span>${fmt(M.actAt(t), k.fmt)}</span></div>`
					: `<div><span>Projected</span><span>${fmt(M.projAt(t), k.fmt)}</span></div><div><span>Range</span><span>${fmt(M.projAt(t, 1 - sp), k.fmt)}–${fmt(M.projAt(t, 1 + sp), k.fmt)}</span></div>`
			this.els.tip.classList.remove("pinned")
			this.els.tip.innerHTML = h
			this.placeBox({ left: me.clientX - 2, right: me.clientX + 2, top: me.clientY - 10, bottom: me.clientY + 10 })
		})
		ov.addEventListener("mouseleave", () => {
			if (this.pin == null) this.hideTip()
			cross.setAttribute("opacity", "0")
		})

		/* scroll position */
		this.syncing = true
		const st = ui.scrollT ?? (Rm ? T - Rm * 0.25 : T0)
		scroller.scrollLeft = Rm ? Math.max(0, (st - T0) * ppm) : 0
		this.syncing = false
		this.updMonth()
		this.stickLabels()
		if (this.pin != null) {
			const o = this.find(this.pin)
			if (o) this.placeTipFor(o, true)
		} else this.hideTip()
	}

	private stickLabels(): void {
		if (!this.cur) return
		const left = this.els.scroller.scrollLeft + this.cur.L + 8
		for (const s of this.sticky) {
			const nx = Math.max(s.bx + 7, Math.min(left, s.bx + s.bw - s.w - 7))
			for (const e of s.els) e.setAttribute("x", String(nx))
		}
	}

	private updMonth(): void {
		const c = this.cur
		if (!c) return
		const ranged = RANGES[c.ui.range] != null
		const t = ranged ? c.T0 + this.els.scroller.scrollLeft / c.ppm : c.T0
		const d = c.time.toDate(t + 0.001)
		this.els.curmonth.textContent = ranged
			? `${MONTH[d.getMonth()]} ${d.getFullYear()}`
			: `${c.time.monthYear(c.T0)} – ${c.time.monthYear(c.T1 - 0.01)}`
	}

	/* ---------- tooltip ---------- */

	private tipHtml(o: Item): string {
		const c = this.cur!
		const f = c.k.fmt
		const t = c.time
		const r = (a: string, b: string) => `<div><span>${a}</span><span>${b}</span></div>`
		let h =
			`<b>${esc(o.it.name)}</b><div><span><span class="sw" style="background:${o.color}"></span>${o.status}</span><span></span></div>` +
			r("If off plan", o.timing === "fixed" ? "Impact changes" : "Timeline moves") +
			r("Growth", o.growth === "exp" ? "Exponential" : "Linear") +
			"<hr>"
		const eff = c.k.kind === "effort"
		h += r(eff ? "Estimated effort" : "Planned impact", fmtD(o.P, f))
		if (o.state !== "planned") h += r(eff ? "Spent" : o.state === "done" ? "Delivered" : "Achieved so far", fmtD(o.N, f))
		if (o.state === "active") h += r(eff ? "Projected effort" : "Projected impact", fmtD(o.proj, f))
		if (o.state !== "planned") h += r(eff ? "Effort vs estimate" : "Impact vs plan", fmtD(o.dImp, f))
		h += "<hr>" + r("Planned", t.mWin(o.pa, o.pe))
		if (o.state === "done") h += r("Actual", t.mWin(o.sa, o.ea))
		if (o.state === "active") {
			if (Math.abs(o.sa - o.pa) > 0.05) h += r("Started", t.dLab(o.sa))
			h += r("Projected end", t.dLab(o.pend))
		}
		if (o.state !== "planned") h += r("Time vs plan", fmtMo(o.dT))
		if (o.state === "active" && o.expected != null) h += r("Expected by today", fmtD(o.expected, f))
		if (o.it.note) h += `<hr><div class="note">${esc(o.it.note)}</div>`
		return h
	}

	private placeBox(bb: { left: number; right: number; top: number; bottom: number }): void {
		const { tip, board, wrap } = this.els
		const c = this.cur!
		const box = board.getBoundingClientRect()
		const w = tip.offsetWidth
		const h = tip.offsetHeight
		const pad = 10
		const rel = { l: bb.left - box.left, r: bb.right - box.left, t: bb.top - box.top, b: bb.bottom - box.top }
		const cw = wrap.getBoundingClientRect()
		const minX = cw.left - box.left + c.L
		const maxX = box.width - 4
		let left: number
		let topY: number
		if (rel.r + pad + w <= maxX) {
			left = rel.r + pad
			topY = rel.t
		} else if (rel.l - pad - w >= minX) {
			left = rel.l - pad - w
			topY = rel.t
		} else {
			left = clamp(rel.l, minX, maxX - w)
			topY = rel.t - pad - h >= 0 ? rel.t - pad - h : rel.b + pad
		}
		topY = clamp(topY, 0, box.height - h - 4)
		tip.style.left = left + "px"
		tip.style.top = topY + "px"
		tip.style.opacity = "1"
	}

	private placeTipFor(o: Item, pinned: boolean): void {
		const { tip, stage } = this.els
		tip.classList.toggle("pinned", pinned)
		tip.innerHTML = (pinned ? `<button class="x" aria-label="Close">×</button>` : "") + this.tipHtml(o)
		if (pinned) (tip.querySelector(".x") as HTMLElement).onclick = () => this.setPin(null)
		const g = stage.querySelector(`.blk[data-id="${CSS.escape(o.id)}"]`)
		if (!g) return
		this.placeBox(g.getBoundingClientRect())
	}

	private hideTip(): void {
		this.els.tip.style.opacity = "0"
		this.els.tip.classList.remove("pinned")
	}

	/* ---------- highlight ---------- */

	private applyHi(): void {
		const act = this.active
		const b = this.els.stage.querySelector("[data-blocks]")
		if (b) {
			b.classList.toggle("dim", act != null)
			b.querySelectorAll<SVGElement>(".blk").forEach((g) => g.classList.toggle("on", g.dataset.id === act))
		}
		this.cb.onActive(act)
	}

	setHov(id: string | null): void {
		this.hov = id
		this.applyHi()
	}

	setPin(id: string | null): void {
		this.pin = id
		this.hov = null
		this.applyHi()
		if (id == null) {
			this.hideTip()
			return
		}
		const o = this.find(id)
		if (o) {
			this.scrollIntoViewFor(o)
			this.placeTipFor(o, true)
		}
	}

	get pinned(): string | null {
		return this.pin
	}

	private scrollIntoViewFor(o: Item): void {
		const c = this.cur!
		if (!RANGES[c.ui.range]) return
		const sc = this.els.scroller
		const a = c.x(Math.min(o.pa, o.sa)) - c.L
		const b = c.x(Math.max(o.pe, o.pend)) - c.L
		const vw = c.VW - c.L - c.R
		if (a < sc.scrollLeft || b > sc.scrollLeft + vw) sc.scrollLeft = Math.max(0, a - 20)
	}
}
