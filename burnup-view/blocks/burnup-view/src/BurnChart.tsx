/**
 * The burn-up / burn-down SVG. Step lines for recorded scope and done,
 * a dashed ideal line to the target, a dashed forecast from today, and a
 * crosshair tooltip.
 */
import { useLayoutEffect, useRef, useState } from "react"
import { fmtDay, fmtNum, nextBucket, type Burn, type Bucket, type Mode } from "./burn"

export type Lines = { scope: boolean; done: boolean; ideal: boolean; forecast: boolean }

const H = 320
const PAD = { l: 44, r: 16, t: 18, b: 28 }

function niceMax(v: number): number {
	if (v <= 0) return 1
	const p = Math.pow(10, Math.floor(Math.log10(v)))
	return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!
}

export function BurnChart({ B, mode, lines, unit, flags = [] }: { B: Burn; mode: Mode; lines: Lines; unit: string; flags?: { pct: number; t: number }[] }) {
	const wrap = useRef<HTMLDivElement>(null)
	const [W, setW] = useState(700)
	const [hov, setHov] = useState<number | null>(null)
	useLayoutEffect(() => {
		const el = wrap.current
		if (!el) return
		const ro = new ResizeObserver(() => setW(Math.max(280, el.clientWidth)))
		ro.observe(el)
		setW(Math.max(280, el.clientWidth))
		return () => ro.disconnect()
	}, [])

	const up = mode === "up"
	const val = (p: { scope: number; done: number }) => (up ? p.done : p.scope - p.done)
	const yMax = niceMax(Math.max(1, ...B.points.map((p) => p.scope)) * 1.08)
	const x = (t: number) => PAD.l + ((t - B.start) / Math.max(1, B.end - B.start)) * (W - PAD.l - PAD.r)
	const y = (v: number) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b)
	const step = (vals: number[]) => B.points.map((p, i) => `${i ? `H${x(p.t)}V` : `M${x(p.t)},`}${y(vals[i])}`).join("")

	const main = B.points.map(val)
	const scope = B.points.map((p) => p.scope)
	const last = B.points[B.points.length - 1]

	// Month (or week) ticks.
	const ticks: number[] = []
	const tickB: Bucket = B.end - B.start > 120 ? "month" : B.end - B.start > 21 ? "week" : "day"
	for (let t = B.start; t <= B.end; t = nextBucket(t, tickB)) ticks.push(t)
	const every = Math.max(1, Math.ceil(ticks.length / Math.max(2, Math.floor((W - PAD.l) / 70))))

	const fEnd = B.forecast != null && B.forecast <= B.end ? B.forecast : B.forecast != null ? B.end : null
	const fVal = (t: number) => {
		const d = Math.min(B.scopeNow, B.doneNow + B.velocity * (t - B.today))
		return up ? d : B.scopeNow - d
	}

	const hp = hov != null ? B.points[hov] : null
	const onMove = (e: React.PointerEvent<SVGRectElement>) => {
		const r = (e.currentTarget as SVGRectElement).getBoundingClientRect()
		const px = e.clientX - r.left + PAD.l
		let best = 0
		for (let i = 0; i < B.points.length; i++) if (Math.abs(x(B.points[i].t) - px) < Math.abs(x(B.points[best].t) - px)) best = i
		setHov(best)
	}

	return (
		<div className="burnchart" ref={wrap}>
			<svg width={W} height={H} role="img" aria-label={up ? "Burn-up chart: scope and done over time" : "Burn-down chart: remaining work over time"}>
				{[0, 0.25, 0.5, 0.75, 1].map((f) => (
					<g key={f}>
						<line x1={PAD.l} x2={W - PAD.r} y1={y(yMax * f)} y2={y(yMax * f)} stroke="var(--grid)" />
						<text x={PAD.l - 8} y={y(yMax * f) + 4} textAnchor="end" className="axis">
							{fmtNum(yMax * f)}
						</text>
					</g>
				))}
				{ticks.map((t, i) =>
					i % every ? null : (
						<text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="axis">
							{tickLabel(t, tickB)}
						</text>
					)
				)}
				{up && lines.done ? <path d={`${step(main)}V${y(0)}H${x(B.start)}Z`} fill="var(--area)" /> : null}
				{!up && lines.done ? <path d={`${step(main)}V${y(0)}H${x(B.start)}Z`} fill="var(--area)" /> : null}
				{lines.scope ? <path d={step(scope)} fill="none" stroke="var(--scope)" strokeWidth={1.6} /> : null}
				{lines.done ? <path d={step(main)} fill="none" stroke="var(--blue)" strokeWidth={2.2} /> : null}
				{lines.ideal && B.ideal ? (
					<line x1={x(B.ideal[0].t)} y1={y(val(B.ideal[0]))} x2={x(B.ideal[1].t)} y2={y(val(B.ideal[1]))} stroke="var(--goal)" strokeWidth={1.2} strokeDasharray="7 4" />
				) : null}
				{lines.forecast && fEnd != null && fEnd > B.today ? (
					<>
						<line x1={x(B.today)} y1={y(val(last))} x2={x(fEnd)} y2={y(fVal(fEnd))} stroke="var(--ink2)" strokeWidth={1.4} strokeDasharray="5 3" />
						{lines.scope && up ? <line x1={x(B.today)} x2={x(B.end)} y1={y(B.scopeNow)} y2={y(B.scopeNow)} stroke="var(--scope)" strokeWidth={1.2} strokeDasharray="2 4" /> : null}
						{B.forecast != null && B.forecast <= B.end ? <circle cx={x(B.forecast)} cy={y(fVal(B.forecast))} r={4} fill="var(--ink2)" stroke="var(--bg)" strokeWidth={2} /> : null}
					</>
				) : null}
				{B.target != null ? (
					<g>
						<line x1={x(B.target)} x2={x(B.target)} y1={PAD.t} y2={H - PAD.b} stroke="var(--goal)" strokeWidth={1} />
						<text x={x(B.target) - 4} y={PAD.t + 10} textAnchor="end" className="lbl" fill="var(--goal)">
							Target {fmtDay(B.target)}
						</text>
					</g>
				) : null}
				{flags.map((f) => {
					const p = B.points.find((q) => q.t === f.t)!
					const fx = x(f.t)
					const fy = y(val(p)) - 4
					return (
						<g key={f.pct} className="flag">
							<title>{`${f.pct}% done on ${fmtDay(f.t)}`}</title>
							<line x1={fx} x2={fx} y1={fy} y2={fy - 18} stroke="var(--ink2)" />
							<path d={`M${fx},${fy - 18}h${f.pct === 100 ? 24 : 30}l-4,5 4,5h-${f.pct === 100 ? 24 : 30}z`} fill={f.pct === 100 ? "var(--good)" : "var(--blue)"} />
							<text x={fx + 3} y={fy - 10} className="flagtxt">
								{f.pct === 100 ? "🎉" : `${f.pct}%`}
							</text>
						</g>
					)
				})}
				<line x1={x(B.today)} x2={x(B.today)} y1={PAD.t - 6} y2={H - PAD.b} stroke="var(--today)" />
				<circle cx={x(B.today)} cy={PAD.t - 6} r={3} fill="var(--today)" />
				{hp ? (
					<g pointerEvents="none">
						<line x1={x(hp.t)} x2={x(hp.t)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink2)" strokeDasharray="2 2" />
						<circle cx={x(hp.t)} cy={y(val(hp))} r={3.5} fill="var(--blue)" />
					</g>
				) : null}
				<rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHov(null)} />
			</svg>
			{hp ? (
				<div className="btip" style={{ left: Math.min(W - 180, x(hp.t) + 10), top: 20 }}>
					<b>{fmtDay(hp.t)}</b>
					<div>
						<span>Scope</span>
						<span>
							{fmtNum(hp.scope)} {unit}
						</span>
					</div>
					<div>
						<span>Done</span>
						<span>
							{fmtNum(hp.done)} {unit}
						</span>
					</div>
					<div>
						<span>Remaining</span>
						<span>
							{fmtNum(hp.scope - hp.done)} {unit}
						</span>
					</div>
				</div>
			) : null}
			<div className="legend">
				{lines.scope ? <Key c="var(--scope)" l="Scope" /> : null}
				{lines.done ? <Key c="var(--blue)" l={up ? "Done" : "Remaining"} w={2.2} /> : null}
				{lines.ideal && B.ideal ? <Key c="var(--goal)" l="Ideal" dash="7 4" /> : null}
				{lines.forecast ? <Key c="var(--ink2)" l="Forecast" dash="5 3" /> : null}
				<Key c="var(--today)" l="Today" />
			</div>
		</div>
	)
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function tickLabel(t: number, b: Bucket): string {
	const d = new Date(t * 86400000)
	if (b !== "month") return fmtDay(t, false)
	return d.getUTCMonth() === 0 ? `Jan ’${String(d.getUTCFullYear()).slice(2)}` : MON[d.getUTCMonth()]
}

function Key({ c, l, dash, w = 1.6 }: { c: string; l: string; dash?: string; w?: number }) {
	return (
		<span className="key">
			<svg width="20" height="8" aria-hidden="true">
				<line x1="0" x2="20" y1="4" y2="4" stroke={c} strokeWidth={w} strokeDasharray={dash} />
			</svg>
			{l}
		</span>
	)
}
