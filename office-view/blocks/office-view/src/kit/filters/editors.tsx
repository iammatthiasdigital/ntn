/**
 * Value editors for filter rules, one per property kind, plus the property
 * picker — shared by the chip popovers and the advanced filter rows.
 */
import { useMemo, useState, type ReactNode } from "react"
import {
	dateRefLabel,
	DATE_REF_LABEL,
	dayIso,
	formatDay,
	isEmptyOp,
	ME,
	relativeLabel,
	resolveRef,
	type DateRange,
	type DateRef,
	type FilterOption,
	type FilterProperty,
	type RelativeDate,
	type Rule,
	type RuleValue,
} from "./core"
import { ArrowRight, Chevron, Close, PageIcon, PropIcon, Search } from "./icons"
import { MenuItem, Popover, Select, useAnchor } from "./popover"

/* ---------- tags & avatars ---------- */

export function Tag({ color, children, onRemove }: { color?: string; children: ReactNode; onRemove?: () => void }) {
	const c = (color ?? "default").replace(/_background$/, "")
	return (
		<span className={`tag tag-${c}`}>
			<span className="tag-l">{children}</span>
			{onRemove ? (
				<button type="button" className="tag-x" aria-label="Remove" onClick={onRemove}>
					<Close size={12} />
				</button>
			) : null}
		</span>
	)
}

export function Avatar({ name }: { name: string }) {
	return <span className="avatar">{(name.trim()[0] ?? "?").toUpperCase()}</span>
}

function optionBody(p: FilterProperty, o: FilterOption, onRemove?: () => void): ReactNode {
	if (p.kind === "person")
		return (
			<span className="person">
				<Avatar name={o.label} />
				<span>{o.label}</span>
				{onRemove ? (
					<button type="button" className="tag-x" aria-label="Remove" onClick={onRemove}>
						<Close size={12} />
					</button>
				) : null}
			</span>
		)
	if (p.kind === "relation")
		return (
			<span className="relpage">
				<PageIcon />
				<span className="u">{o.label}</span>
				{onRemove ? (
					<button type="button" className="tag-x" aria-label="Remove" onClick={onRemove}>
						<Close size={12} />
					</button>
				) : null}
			</span>
		)
	if (p.kind === "status")
		return (
			<Tag color={o.color} onRemove={onRemove}>
				<span className={`dot dot-${(o.color ?? "default").replace(/_background$/, "")}`} />
				{o.label}
			</Tag>
		)
	return (
		<Tag color={o.color} onRemove={onRemove}>
			{o.label}
		</Tag>
	)
}

/* ---------- option picker (select, status, multi-select, people, relation) ---------- */

export function OptionPicker({ p, value, onChange }: { p: FilterProperty; value: string[]; onChange: (v: string[]) => void }) {
	const [q, setQ] = useState("")
	const chosen = new Set(value)
	const shown = p.options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))
	const toggle = (v: string) => onChange(chosen.has(v) ? value.filter((x) => x !== v) : [...value, v])
	const row = (o: FilterOption) => (
		<button type="button" key={o.value} className="mi opt" role="menuitemcheckbox" aria-checked={chosen.has(o.value)} onClick={() => toggle(o.value)}>
			<span className={"cbox" + (chosen.has(o.value) ? " on" : "")} aria-hidden="true" />
			{optionBody(p, o)}
		</button>
	)
	const placeholder = p.kind === "person" ? "Search for a person…" : p.kind === "relation" ? "Search for a page…" : "Search for an option…"
	let list: ReactNode
	if (p.kind === "status" && p.groups?.length && !q) {
		list = p.groups.map((g) => {
			const opts = shown.filter((o) => o.group === g.id)
			if (!opts.length) return null
			return (
				<div key={g.id}>
					<div className="mhead">{g.name}</div>
					{opts.map(row)}
				</div>
			)
		})
		const loose = shown.filter((o) => !o.group || !p.groups!.some((g) => g.id === o.group))
		if (loose.length) list = [list, <div key="_loose">{loose.map(row)}</div>]
	} else list = shown.map(row)
	return (
		<div className="picker">
			<div className="tokens">
				{value.map((v) => {
					const o = p.options.find((x) => x.value === v) ?? { value: v, label: v }
					return <span key={v}>{optionBody(p, o, () => toggle(v))}</span>
				})}
				<input
					autoFocus
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder={value.length ? "" : placeholder}
					aria-label={placeholder}
					onKeyDown={(e) => {
						if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1))
						if (e.key === "Enter" && shown[0]) {
							toggle(shown[0].value)
							setQ("")
						}
					}}
				/>
			</div>
			<div className="menu scroll" role="menu">
				{shown.length ? list : <div className="mempty">No results</div>}
			</div>
		</div>
	)
}

/* ---------- calendar ---------- */

const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export function Calendar({ value, range, today, onPick }: { value?: string | null; range?: [string | null, string | null]; today: string; onPick: (iso: string) => void }) {
	const base = value ?? range?.[0] ?? today
	const [ym, setYm] = useState(() => base.slice(0, 7))
	const [y, m] = ym.split("-").map(Number)
	const first = new Date(y, m - 1, 1)
	const cells: string[] = []
	for (let i = 0; i < 42; i++) cells.push(dayIso(new Date(y, m - 1, 1 - first.getDay() + i)))
	const step = (n: number) => setYm(dayIso(new Date(y, m - 1 + n, 1)).slice(0, 7))
	const [lo, hi] = range ? [range[0], range[1]].sort() : [null, null]
	return (
		<div className="cal">
			<div className="cal-h">
				<span className="cal-t">
					{MONTHS[m - 1]} {y}
				</span>
				<button type="button" className="ghost sm" onClick={() => setYm(today.slice(0, 7))}>
					Today
				</button>
				<button type="button" className="ghost ic" aria-label="Previous month" onClick={() => step(-1)}>
					<span style={{ display: "inline-flex", transform: "scaleX(-1)" }}>
						<ArrowRight />
					</span>
				</button>
				<button type="button" className="ghost ic" aria-label="Next month" onClick={() => step(1)}>
					<ArrowRight />
				</button>
			</div>
			<div className="cal-g">
				{WD.map((d) => (
					<span key={d} className="cal-wd">
						{d}
					</span>
				))}
				{cells.map((iso) => {
					const out = iso.slice(0, 7) !== ym
					const sel = iso === value || (range && (iso === range[0] || iso === range[1]))
					const inRange = lo && hi && iso > lo && iso < hi
					return (
						<button
							type="button"
							key={iso}
							className={"cal-d" + (out ? " out" : "") + (iso === today ? " today" : "") + (sel ? " sel" : "") + (inRange ? " rng" : "")}
							onClick={() => onPick(iso)}
							aria-label={formatDay(iso)}
							aria-pressed={!!sel}
						>
							{Number(iso.slice(8))}
						</button>
					)
				})}
			</div>
		</div>
	)
}

/* ---------- dates ---------- */

type RefType = DateRef["type"]
const REF_OPTIONS: { value: RefType; label: string }[] = [
	...(Object.keys(DATE_REF_LABEL) as Exclude<RefType, "exact">[]).map((k) => ({ value: k as RefType, label: DATE_REF_LABEL[k] })),
	{ value: "exact", label: "Exact date" },
]

function RefField({ value, today, onChange, onFocus, focused }: { value?: DateRef; today: string; onChange: (r: DateRef) => void; onFocus?: () => void; focused?: boolean }) {
	const type = value?.type ?? "exact"
	const [draft, setDraft] = useState<string | null>(null)
	const shown = draft ?? (value ? (value.type === "exact" ? (value.date ? formatDay(value.date) : "") : dateRefLabel(value)) : "")
	return (
		<div className={"datefield" + (focused ? " focus" : "")}>
			<input
				value={shown}
				placeholder="Pick a date"
				aria-label="Date"
				readOnly={type !== "exact"}
				onFocus={onFocus}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={() => {
					if (draft != null) {
						const t = Date.parse(draft)
						if (!Number.isNaN(t)) onChange({ type: "exact", date: dayIso(new Date(t)) })
						setDraft(null)
					}
				}}
				onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
			/>
			<Select<RefType>
				value={type}
				options={REF_OPTIONS}
				width={190}
				className="quiet"
				ariaLabel="Date reference"
				onChange={(t) => onChange(t === "exact" ? { type: "exact", date: resolveRef(value, today) ?? today } : ({ type: t } as DateRef))}
			/>
		</div>
	)
}

export function DateEditor({ rule, today, onChange }: { rule: Rule; today: string; onChange: (v: RuleValue) => void }) {
	const [focus, setFocus] = useState<"start" | "end">("start")
	if (rule.operator === "relative") {
		const r = (rule.value as RelativeDate) ?? { dir: "past", n: 1, unit: "week" }
		return (
			<div className="rel">
				<Select
					value={r.dir}
					options={[
						{ value: "past", label: "Past" },
						{ value: "next", label: "Next" },
						{ value: "this", label: "This" },
					]}
					width={120}
					ariaLabel="Direction"
					onChange={(dir) => onChange({ ...r, dir })}
				/>
				{r.dir !== "this" ? (
					<input
						className="field num-in"
						type="number"
						min={1}
						value={r.n}
						aria-label="Amount"
						onChange={(e) => onChange({ ...r, n: Math.max(1, Number(e.target.value) || 1) })}
					/>
				) : null}
				<Select
					value={r.unit}
					options={(["day", "week", "month", "year"] as const).map((u) => ({ value: u, label: r.dir === "this" || r.n === 1 ? u : u + "s" }))}
					width={120}
					ariaLabel="Unit"
					onChange={(unit) => onChange({ ...r, unit })}
				/>
			</div>
		)
	}
	if (rule.operator === "between") {
		const r = (rule.value as DateRange) ?? {}
		const a = resolveRef(r.start, today)
		const b = resolveRef(r.end, today)
		return (
			<div className="dateed">
				<RefField value={r.start} today={today} focused={focus === "start"} onFocus={() => setFocus("start")} onChange={(start) => onChange({ ...r, start })} />
				<RefField value={r.end} today={today} focused={focus === "end"} onFocus={() => setFocus("end")} onChange={(end) => onChange({ ...r, end })} />
				<Calendar
					range={[a, b]}
					today={today}
					onPick={(iso) => {
						if (focus === "start") {
							onChange({ ...r, start: { type: "exact", date: iso } })
							setFocus("end")
						} else {
							onChange({ ...r, end: { type: "exact", date: iso } })
							setFocus("start")
						}
					}}
				/>
			</div>
		)
	}
	const ref = rule.value as DateRef | null
	return (
		<div className="dateed">
			<RefField value={ref ?? undefined} today={today} onChange={onChange} />
			<Calendar value={resolveRef(ref ?? undefined, today)} today={today} onPick={(iso) => onChange({ type: "exact", date: iso })} />
		</div>
	)
}

/* ---------- value editor ---------- */

export function ValueEditor({
	rule,
	p,
	today,
	onChange,
	compact,
}: {
	rule: Rule
	p: FilterProperty
	today: string
	onChange: (v: RuleValue) => void
	/** Inline (advanced rows): option and date editors open in a popover. */
	compact?: boolean
}) {
	if (isEmptyOp(rule.operator) || p.kind === "files") return compact ? <span className="val-none" /> : null
	switch (p.kind) {
		case "checkbox":
			return compact ? (
				<Select
					value={rule.value === false ? "unchecked" : "checked"}
					options={[
						{ value: "checked", label: "Checked" },
						{ value: "unchecked", label: "Unchecked" },
					]}
					className="val-sel"
					width={160}
					ariaLabel="Checkbox value"
					onChange={(v) => onChange(v === "checked")}
				/>
			) : (
				<div className="menu" role="menu">
					<MenuItem selected={rule.value !== false} onClick={() => onChange(true)}>
						Checked
					</MenuItem>
					<MenuItem selected={rule.value === false} onClick={() => onChange(false)}>
						Unchecked
					</MenuItem>
				</div>
			)
		case "select":
		case "status":
		case "multi":
		case "person":
		case "relation": {
			const v = Array.isArray(rule.value) ? rule.value : []
			if (!compact) return <OptionPicker p={p} value={v} onChange={onChange} />
			return <OptionButton p={p} value={v} onChange={onChange} />
		}
		case "date":
			if (!compact) return <DateEditor rule={rule} today={today} onChange={onChange} />
			return <DateButton rule={rule} today={today} onChange={onChange} />
		default:
			return (
				<input
					className={"field" + (compact ? " val-in" : "")}
					autoFocus={!compact}
					type={p.kind === "number" ? "number" : "text"}
					inputMode={p.kind === "number" ? "decimal" : undefined}
					placeholder="Type a value…"
					aria-label={`${p.name} value`}
					value={typeof rule.value === "string" ? rule.value : ""}
					onChange={(e) => onChange(e.target.value)}
				/>
			)
	}
}

function OptionButton({ p, value, onChange }: { p: FilterProperty; value: string[]; onChange: (v: string[]) => void }) {
	const a = useAnchor()
	return (
		<>
			<button type="button" ref={a.ref} className="val-btn" onClick={a.toggle} aria-haspopup="dialog">
				{value.length ? (
					<span className="val-tags">
						{value.map((v) => {
							const o = p.options.find((x) => x.value === v) ?? { value: v, label: v }
							return <span key={v}>{optionBody(p, o)}</span>
						})}
					</span>
				) : (
					<span className="ph">{p.kind === "person" ? "Select people" : p.kind === "relation" ? "Select pages" : "Select an option"}</span>
				)}
				<Chevron />
			</button>
			{a.open ? (
				<Popover anchor={a.el} onClose={a.close} width={290}>
					<OptionPicker p={p} value={value} onChange={onChange} />
				</Popover>
			) : null}
		</>
	)
}

function DateButton({ rule, today, onChange }: { rule: Rule; today: string; onChange: (v: RuleValue) => void }) {
	const a = useAnchor()
	const v = rule.value
	const label =
		rule.operator === "between"
			? `${dateRefLabel((v as DateRange | null)?.start)} → ${dateRefLabel((v as DateRange | null)?.end)}`
			: rule.operator === "relative"
				? relativeLabel(v as RelativeDate)
				: dateRefLabel(v as DateRef)
	return (
		<>
			<button type="button" ref={a.ref} className="val-btn" onClick={a.toggle} aria-haspopup="dialog">
				<span>{label}</span>
				<Chevron />
			</button>
			{a.open ? (
				<Popover anchor={a.el} onClose={a.close} width={rule.operator === "relative" ? 340 : 280}>
					<div className="pad">
						<DateEditor rule={rule} today={today} onChange={onChange} />
					</div>
				</Popover>
			) : null}
		</>
	)
}

/* ---------- property picker ---------- */

export function PropertyMenu({ properties, onPick, footer, placeholder = "Filter by…" }: { properties: FilterProperty[]; onPick: (p: FilterProperty) => void; footer?: ReactNode; placeholder?: string }) {
	const [q, setQ] = useState("")
	const [hi, setHi] = useState(0)
	const shown = useMemo(() => properties.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())), [properties, q])
	return (
		<div className="propmenu">
			<div className="msearch">
				<Search />
				<input
					autoFocus
					value={q}
					placeholder={placeholder}
					aria-label={placeholder}
					onChange={(e) => {
						setQ(e.target.value)
						setHi(0)
					}}
					onKeyDown={(e) => {
						if (e.key === "ArrowDown") (e.preventDefault(), setHi((h) => Math.min(shown.length - 1, h + 1)))
						if (e.key === "ArrowUp") (e.preventDefault(), setHi((h) => Math.max(0, h - 1)))
						if (e.key === "Enter" && shown[hi]) onPick(shown[hi])
					}}
				/>
			</div>
			<div className="menu scroll" role="menu">
				{shown.map((p, i) => (
					<MenuItem key={p.id} icon={<PropIcon type={p.type} />} active={i === hi} onClick={() => onPick(p)}>
						{p.name}
					</MenuItem>
				))}
				{shown.length === 0 ? <div className="mempty">No results</div> : null}
			</div>
			{footer}
		</div>
	)
}

export { ME }
