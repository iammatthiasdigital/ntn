/**
 * Notion-style view filters, evaluated client-side over the rows a custom
 * block receives. The host's own query filters only cover an AND of simple
 * conditions on a few property types; this engine covers every property
 * type the bridge delivers (formulas and rollups arrive as text and are
 * typed by inspecting their values), plus And/Or groups and relative dates.
 * Pure — no DOM, no SDK imports.
 */

export type Kind =
	| "text"
	| "number"
	| "checkbox"
	| "select"
	| "status"
	| "multi"
	| "date"
	| "person"
	| "relation"
	| "files"

export type FilterOption = {
	/** Stored in rules: option name, user id, or page id. */
	value: string
	label: string
	/** Notion color name (select / multi-select / status options). */
	color?: string
	/** Status group id. */
	group?: string
}

export type StatusGroup = { id: string; name: string; color?: string }

export type FilterProperty = {
	id: string
	name: string
	/** Notion property type as delivered by the host. */
	type: string
	kind: Kind
	options: FilterOption[]
	groups?: StatusGroup[]
	/** created_time / last_edited_time / created_by / last_edited_by: never empty. */
	builtin?: boolean
}

export type DateRef =
	| { type: "exact"; date: string }
	| {
			type:
				| "today"
				| "tomorrow"
				| "yesterday"
				| "one_week_ago"
				| "one_week_from_now"
				| "one_month_ago"
				| "one_month_from_now"
	  }

export type RelativeDate = {
	dir: "past" | "next" | "this"
	n: number
	unit: "day" | "week" | "month" | "year"
}

export type DateRange = { start?: DateRef; end?: DateRef }

export type RuleValue = string | string[] | boolean | DateRef | DateRange | RelativeDate | null

export type Operator =
	| "is"
	| "is_not"
	| "contains"
	| "not_contains"
	| "starts_with"
	| "ends_with"
	| "eq"
	| "neq"
	| "gt"
	| "lt"
	| "gte"
	| "lte"
	| "before"
	| "after"
	| "on_or_before"
	| "on_or_after"
	| "between"
	| "relative"
	| "empty"
	| "not_empty"

export type Rule = {
	kind: "rule"
	id: string
	propertyId: string
	operator: Operator
	value: RuleValue
}

export type Group = {
	kind: "group"
	id: string
	conjunction: "and" | "or"
	children: (Rule | Group)[]
}

/** Simple rules render as chips and are ANDed with the advanced filter. */
export type FilterState = { rules: Rule[]; advanced: Group | null }

export const EMPTY_FILTERS: FilterState = { rules: [], advanced: null }

export type FilterRow = { id: string; props: Record<string, unknown> }

export type EvalContext = {
	/** Local `YYYY-MM-DD`. */
	today: string
	/** Viewer's user id, for the "Me" person option. */
	meId?: string
}

export const ME = "__me__"

let seq = 0
export const newId = (): string => `f${Date.now().toString(36)}${(seq++).toString(36)}`

/* ---------- operators ---------- */

const OPS: Record<Kind, Operator[]> = {
	text: ["is", "is_not", "contains", "not_contains", "starts_with", "ends_with", "empty", "not_empty"],
	number: ["eq", "neq", "gt", "lt", "gte", "lte", "empty", "not_empty"],
	checkbox: ["is", "is_not"],
	select: ["is", "is_not", "empty", "not_empty"],
	status: ["is", "is_not", "empty", "not_empty"],
	multi: ["contains", "not_contains", "empty", "not_empty"],
	date: ["is", "before", "after", "on_or_before", "on_or_after", "between", "relative", "empty", "not_empty"],
	person: ["contains", "not_contains", "empty", "not_empty"],
	relation: ["contains", "not_contains", "empty", "not_empty"],
	files: ["not_empty", "empty"],
}

export function operatorsFor(p: FilterProperty): Operator[] {
	const ops = OPS[p.kind]
	return p.builtin ? ops.filter((o) => o !== "empty" && o !== "not_empty") : ops
}

const OP_LABEL: Record<Operator, string> = {
	is: "is",
	is_not: "is not",
	contains: "contains",
	not_contains: "does not contain",
	starts_with: "starts with",
	ends_with: "ends with",
	eq: "=",
	neq: "≠",
	gt: ">",
	lt: "<",
	gte: "≥",
	lte: "≤",
	before: "is before",
	after: "is after",
	on_or_before: "is on or before",
	on_or_after: "is on or after",
	between: "is between",
	relative: "is relative to today",
	empty: "is empty",
	not_empty: "is not empty",
}

export function operatorLabel(op: Operator, kind?: Kind): string {
	if (kind === "files" && op === "not_empty") return "is not empty"
	return OP_LABEL[op]
}

export const isEmptyOp = (op: Operator): boolean => op === "empty" || op === "not_empty"

/** A fresh rule for a property: its first operator and an empty value. */
export function newRule(p: FilterProperty): Rule {
	const operator = operatorsFor(p)[0]
	return { kind: "rule", id: newId(), propertyId: p.id, operator, value: defaultValue(p, operator) }
}

export function defaultValue(p: FilterProperty, op: Operator): RuleValue {
	if (isEmptyOp(op)) return null
	switch (p.kind) {
		case "checkbox":
			return true
		case "select":
		case "status":
		case "multi":
		case "person":
		case "relation":
			return []
		case "date":
			if (op === "between") return {}
			if (op === "relative") return { dir: "past", n: 1, unit: "week" }
			return { type: "today" }
		default:
			return ""
	}
}

/** Keep a rule's value when switching operators where the shape survives. */
export function withOperator(p: FilterProperty, rule: Rule, op: Operator): Rule {
	const prev = rule.value
	const next = defaultValue(p, op)
	const sameShape =
		!isEmptyOp(rule.operator) &&
		!isEmptyOp(op) &&
		(p.kind !== "date" || (rule.operator !== "between" && rule.operator !== "relative" && op !== "between" && op !== "relative"))
	return { ...rule, operator: op, value: sameShape && prev != null ? prev : next }
}

/* ---------- property typing ---------- */

const TEXT_TYPES = new Set(["title", "rich_text", "url", "email", "phone_number", "place", "location", "last_visited_time"])
const BUILTIN_TYPES = new Set(["created_time", "last_edited_time", "created_by", "last_edited_by"])

export type SchemaLike = {
	name?: string
	type: string
	options?: { id?: string; name: string; color?: string }[]
	groups?: { id: string; name: string; color?: string; option_ids?: string[] }[]
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/

/** Formulas and rollups arrive as text: type them by their values. */
function inferKind(values: unknown[]): Kind {
	const texts = values
		.map((v) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : typeof v === "boolean" ? String(v) : ""))
		.filter((s) => s !== "")
	if (texts.length === 0) return "text"
	if (texts.every((s) => s === "true" || s === "false")) return "checkbox"
	if (texts.every((s) => Number.isFinite(Number(s.replace(/,/g, ""))))) return "number"
	if (texts.every((s) => ISO_DAY.test(s))) return "date"
	return "text"
}

export function kindOf(type: string, values: unknown[] = []): Kind | null {
	if (TEXT_TYPES.has(type)) return "text"
	switch (type) {
		case "number":
		case "unique_id":
			return "number"
		case "checkbox":
			return "checkbox"
		case "select":
		case "verification":
			return "select"
		case "status":
			return "status"
		case "multi_select":
			return "multi"
		case "date":
		case "created_time":
		case "last_edited_time":
			return "date"
		case "people":
		case "created_by":
		case "last_edited_by":
			return "person"
		case "relation":
			return "relation"
		case "files":
			return "files"
		case "formula":
		case "rollup":
			return inferKind(values)
		case "button":
			return null
		default:
			return "text"
	}
}

export type Resolvers = {
	userName: (id: string) => string | undefined
	pageTitle: (id: string) => string | undefined
	meId?: string
}

/**
 * Every filterable property of a data source, title first, built-ins last,
 * with the options each one offers: schema options (with their colors) plus
 * any values found in rows, people and related pages found in rows.
 */
export function buildProperties(
	schemas: Record<string, SchemaLike>,
	rows: FilterRow[],
	res: Resolvers
): FilterProperty[] {
	const out: FilterProperty[] = []
	for (const [id, s] of Object.entries(schemas)) {
		const values = rows.map((r) => r.props[id])
		const kind = kindOf(s.type, values)
		if (kind === null) continue
		const p: FilterProperty = {
			id,
			name: s.name?.trim() || builtinName(s.type) || id,
			type: s.type,
			kind,
			options: [],
			builtin: BUILTIN_TYPES.has(s.type) || undefined,
		}
		if (kind === "select" || kind === "status" || kind === "multi") {
			const seen = new Map<string, FilterOption>()
			const groupOf = new Map<string, string>()
			for (const g of s.groups ?? []) for (const oid of g.option_ids ?? []) groupOf.set(oid, g.id)
			for (const o of s.options ?? []) {
				const key = o.name.toLowerCase()
				if (!seen.has(key)) seen.set(key, { value: o.name, label: o.name, color: o.color, group: o.id ? groupOf.get(o.id) : undefined })
			}
			for (const v of values) {
				for (const name of asStrings(v)) {
					const key = name.toLowerCase()
					if (!seen.has(key)) seen.set(key, { value: name, label: name })
				}
			}
			p.options = [...seen.values()]
			if (kind === "status" && s.groups?.length) p.groups = s.groups.map((g) => ({ id: g.id, name: g.name, color: g.color }))
		} else if (kind === "person" || kind === "relation") {
			const ids = new Set<string>()
			for (const v of values) for (const pid of pointerIds(v)) ids.add(pid)
			const label = kind === "person" ? res.userName : res.pageTitle
			p.options = [...ids].map((pid) => ({ value: pid, label: label(pid) ?? fallbackLabel(pid, kind) }))
			p.options.sort((a, b) => a.label.localeCompare(b.label))
			if (kind === "person") p.options.unshift({ value: ME, label: "Me" })
		}
		out.push(p)
	}
	const rank = (p: FilterProperty) => (p.type === "title" ? 0 : p.builtin ? 2 : 1)
	return out.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(({ p }) => p)
}

function builtinName(type: string): string | undefined {
	return {
		created_time: "Created time",
		last_edited_time: "Last edited time",
		created_by: "Created by",
		last_edited_by: "Last edited by",
	}[type]
}

/** Readable stand-in for a person/page the host couldn't resolve. */
export function fallbackLabel(id: string, kind: Kind): string {
	const uuid = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id)
	if (!uuid) {
		const words = id.replace(/^(user|page|init|kpi)[-_]/i, "").split(/[-_]+/).filter(Boolean)
		if (words.length) return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")
	}
	return kind === "person" ? "Unknown user" : "Untitled"
}

/* ---------- values ---------- */

export function asStrings(v: unknown): string[] {
	if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : pointerId(x))).filter((s): s is string => !!s)
	if (typeof v === "string" && v.trim() !== "") return [v]
	return []
}

function pointerId(v: unknown): string | null {
	if (v !== null && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") return (v as { id: string }).id
	return null
}

export function pointerIds(v: unknown): string[] {
	if (!Array.isArray(v)) return []
	return v.map((x) => (typeof x === "string" ? x : pointerId(x))).filter((s): s is string => !!s)
}

export function textOf(v: unknown): string {
	if (v == null) return ""
	if (typeof v === "string") return v
	if (typeof v === "number" || typeof v === "boolean") return String(v)
	if (Array.isArray(v)) return asStrings(v).join(", ")
	const d = dateOf(v)
	return d ? d.start + (d.end ? ` → ${d.end}` : "") : ""
}

export function numberOf(v: unknown, type?: string): number | null {
	if (typeof v === "number") return Number.isFinite(v) ? v : null
	if (typeof v !== "string" || v.trim() === "") return null
	if (type === "unique_id") {
		const m = v.match(/(\d+)\s*$/)
		return m ? Number(m[1]) : null
	}
	const n = Number(v.replace(/,/g, "").trim())
	return Number.isFinite(n) ? n : null
}

export function checkboxOf(v: unknown): boolean {
	if (typeof v === "boolean") return v
	if (typeof v === "string") return v.trim().toLowerCase() === "true"
	return false
}

const pad = (n: number) => String(n).padStart(2, "0")
export const dayIso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** A date-shaped value as local `YYYY-MM-DD` start (and end, for ranges). */
export function dateOf(v: unknown, utc = false): { start: string; end?: string } | null {
	if (typeof v === "string") {
		const parts = v.split(/\s*→\s*/)
		const s = parts[0]?.match(ISO_DAY)?.[0]
		if (!s) return null
		const e = parts[1]?.match(ISO_DAY)?.[0]
		return e ? { start: s, end: e } : { start: s }
	}
	if (v === null || typeof v !== "object") return null
	const o = v as { type?: string; start_date?: string; end_date?: string; start_time?: string; end_time?: string }
	if (typeof o.start_date !== "string") return null
	const local = (date: string, time?: string) => {
		if (!utc || !time) return date.slice(0, 10)
		const t = new Date(`${date}T${time.length === 5 ? time + ":00" : time}Z`)
		return Number.isNaN(t.getTime()) ? date.slice(0, 10) : dayIso(t)
	}
	const start = local(o.start_date, o.start_time)
	return typeof o.end_date === "string" ? { start, end: local(o.end_date, o.end_time) } : { start }
}

/* ---------- dates ---------- */

function addDays(iso: string, n: number): string {
	const [y, m, d] = iso.split("-").map(Number)
	return dayIso(new Date(y, m - 1, d + n))
}
function addMonths(iso: string, n: number): string {
	const [y, m, d] = iso.split("-").map(Number)
	const dim = new Date(y, m - 1 + n + 1, 0).getDate()
	return dayIso(new Date(y, m - 1 + n, Math.min(d, dim)))
}

export function resolveRef(ref: DateRef | undefined, today: string): string | null {
	if (!ref) return null
	switch (ref.type) {
		case "exact":
			return ISO_DAY.test(ref.date) ? ref.date.slice(0, 10) : null
		case "today":
			return today
		case "tomorrow":
			return addDays(today, 1)
		case "yesterday":
			return addDays(today, -1)
		case "one_week_ago":
			return addDays(today, -7)
		case "one_week_from_now":
			return addDays(today, 7)
		case "one_month_ago":
			return addMonths(today, -1)
		case "one_month_from_now":
			return addMonths(today, 1)
	}
}

/** Inclusive `[from, to]` window of a relative-date rule. */
export function relativeWindow(r: RelativeDate, today: string): [string, string] {
	const n = Math.max(1, Math.floor(r.n || 1))
	const step = (iso: string, k: number) =>
		r.unit === "day" ? addDays(iso, k) : r.unit === "week" ? addDays(iso, 7 * k) : r.unit === "month" ? addMonths(iso, k) : addMonths(iso, 12 * k)
	if (r.dir === "past") return [step(today, -n), today]
	if (r.dir === "next") return [today, step(today, n)]
	const [y, m, d] = today.split("-").map(Number)
	if (r.unit === "day") return [today, today]
	if (r.unit === "week") {
		const dow = (new Date(y, m - 1, d).getDay() + 6) % 7
		const from = addDays(today, -dow)
		return [from, addDays(from, 6)]
	}
	if (r.unit === "month") return [`${y}-${pad(m)}-01`, dayIso(new Date(y, m, 0))]
	return [`${y}-01-01`, `${y}-12-31`]
}

/* ---------- evaluation ---------- */

export function isActive(rule: Rule, p: FilterProperty): boolean {
	if (isEmptyOp(rule.operator)) return true
	const v = rule.value
	switch (p.kind) {
		case "checkbox":
			return typeof v === "boolean"
		case "select":
		case "status":
		case "multi":
		case "person":
		case "relation":
			return Array.isArray(v) && v.length > 0
		case "date":
			if (rule.operator === "between") {
				const r = v as DateRange | null
				return !!r && !!r.start && !!r.end && (r.start.type !== "exact" || !!r.start.date) && (r.end.type !== "exact" || !!r.end.date)
			}
			if (rule.operator === "relative") return !!v && typeof v === "object" && "dir" in v
			return !!v && typeof v === "object" && "type" in v && (v.type !== "exact" || !!(v as { date: string }).date)
		case "files":
			return false
		default:
			return typeof v === "string" && v.trim() !== ""
	}
}

function isEmptyValue(p: FilterProperty, raw: unknown): boolean {
	switch (p.kind) {
		case "number":
			return numberOf(raw, p.type) === null
		case "checkbox":
			return false
		case "multi":
			return asStrings(raw).length === 0
		case "person":
		case "relation":
			return pointerIds(raw).length === 0
		case "date":
			return dateOf(raw) === null
		default:
			return textOf(raw).trim() === ""
	}
}

/** Does one row pass one rule? Inactive rules (no value yet) pass. */
export function testRule(rule: Rule, p: FilterProperty, row: FilterRow, ctx: EvalContext): boolean {
	if (!isActive(rule, p)) return true
	const raw = row.props[p.id]
	if (rule.operator === "empty") return isEmptyValue(p, raw)
	if (rule.operator === "not_empty") return !isEmptyValue(p, raw)
	const v = rule.value
	switch (p.kind) {
		case "text": {
			const a = textOf(raw).toLowerCase()
			const b = String(v).toLowerCase()
			switch (rule.operator) {
				case "is":
					return a === b
				case "is_not":
					return a !== b
				case "contains":
					return a.includes(b)
				case "not_contains":
					return !a.includes(b)
				case "starts_with":
					return a.startsWith(b)
				case "ends_with":
					return a.endsWith(b)
			}
			return true
		}
		case "number": {
			const a = numberOf(raw, p.type)
			const b = Number(v)
			if (!Number.isFinite(b)) return true
			if (a === null) return rule.operator === "neq"
			switch (rule.operator) {
				case "eq":
					return a === b
				case "neq":
					return a !== b
				case "gt":
					return a > b
				case "lt":
					return a < b
				case "gte":
					return a >= b
				case "lte":
					return a <= b
			}
			return true
		}
		case "checkbox": {
			const a = checkboxOf(raw)
			return rule.operator === "is_not" ? a !== v : a === v
		}
		case "select":
		case "status": {
			const a = textOf(raw).toLowerCase()
			const hit = (v as string[]).some((s) => s.toLowerCase() === a)
			return rule.operator === "is_not" ? !hit : hit
		}
		case "multi": {
			const a = new Set(asStrings(raw).map((s) => s.toLowerCase()))
			const hit = (v as string[]).some((s) => a.has(s.toLowerCase()))
			return rule.operator === "not_contains" ? !hit : hit
		}
		case "person":
		case "relation": {
			const a = new Set(pointerIds(raw))
			const want = (v as string[]).map((s) => (s === ME ? (ctx.meId ?? ME) : s))
			const hit = want.some((s) => a.has(s))
			return rule.operator === "not_contains" ? !hit : hit
		}
		case "date": {
			const d = dateOf(raw, p.builtin)
			if (!d) return false
			const s = d.start
			const e = d.end ?? d.start
			if (rule.operator === "between") {
				const r = v as DateRange
				const a = resolveRef(r.start, ctx.today)
				const b = resolveRef(r.end, ctx.today)
				if (!a || !b) return true
				const [lo, hi] = a <= b ? [a, b] : [b, a]
				return s <= hi && e >= lo
			}
			if (rule.operator === "relative") {
				const [lo, hi] = relativeWindow(v as RelativeDate, ctx.today)
				return s <= hi && e >= lo
			}
			const t = resolveRef(v as DateRef, ctx.today)
			if (!t) return true
			switch (rule.operator) {
				case "is":
					return s <= t && t <= e
				case "before":
					return s < t
				case "after":
					return s > t
				case "on_or_before":
					return s <= t
				case "on_or_after":
					return s >= t
			}
			return true
		}
	}
	return true
}

export function testGroup(g: Group, props: Map<string, FilterProperty>, row: FilterRow, ctx: EvalContext): boolean {
	const results: boolean[] = []
	for (const c of g.children) {
		if (c.kind === "group") {
			if (countRules(c, props, true) === 0) continue
			results.push(testGroup(c, props, row, ctx))
		} else {
			const p = props.get(c.propertyId)
			if (!p || !isActive(c, p)) continue
			results.push(testRule(c, p, row, ctx))
		}
	}
	if (results.length === 0) return true
	return g.conjunction === "or" ? results.some(Boolean) : results.every(Boolean)
}

/** Rules in a group; `activeOnly` skips rules without a value or property. */
export function countRules(g: Group, props?: Map<string, FilterProperty>, activeOnly = false): number {
	let n = 0
	for (const c of g.children) {
		if (c.kind === "group") n += countRules(c, props, activeOnly)
		else if (!activeOnly) n++
		else {
			const p = props?.get(c.propertyId)
			if (p && isActive(c, p)) n++
		}
	}
	return n
}

export function applyFilters(state: FilterState, properties: FilterProperty[], rows: FilterRow[], ctx: EvalContext): FilterRow[] {
	const byId = new Map(properties.map((p) => [p.id, p]))
	return rows.filter((row) => {
		for (const r of state.rules) {
			const p = byId.get(r.propertyId)
			if (p && !testRule(r, p, row, ctx)) return false
		}
		return state.advanced ? testGroup(state.advanced, byId, row, ctx) : true
	})
}

export function hasActiveFilters(state: FilterState, properties: FilterProperty[]): boolean {
	const byId = new Map(properties.map((p) => [p.id, p]))
	return (
		state.rules.some((r) => {
			const p = byId.get(r.propertyId)
			return !!p && isActive(r, p)
		}) || (!!state.advanced && countRules(state.advanced, byId, true) > 0)
	)
}

/* ---------- labels ---------- */

export const DATE_REF_LABEL: Record<Exclude<DateRef["type"], "exact">, string> = {
	today: "Today",
	tomorrow: "Tomorrow",
	yesterday: "Yesterday",
	one_week_ago: "One week ago",
	one_week_from_now: "One week from now",
	one_month_ago: "One month ago",
	one_month_from_now: "One month from now",
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function formatDay(iso: string): string {
	const [y, m, d] = iso.split("-").map(Number)
	return `${MON[m - 1]} ${d}, ${y}`
}

export function dateRefLabel(ref: DateRef | undefined): string {
	if (!ref) return "…"
	if (ref.type === "exact") return ref.date ? formatDay(ref.date) : "…"
	return DATE_REF_LABEL[ref.type]
}

export function relativeLabel(r: RelativeDate): string {
	const n = Math.max(1, Math.floor(r.n || 1))
	if (r.dir === "this") return `This ${r.unit}`
	return `${r.dir === "past" ? "Past" : "Next"} ${n === 1 ? r.unit : `${n} ${r.unit}s`}`
}

/** Human summary of a rule's value, as shown on its chip. */
export function valueSummary(rule: Rule, p: FilterProperty): string {
	const v = rule.value
	if (isEmptyOp(rule.operator)) return ""
	switch (p.kind) {
		case "checkbox":
			return v ? "Checked" : "Unchecked"
		case "select":
		case "status":
		case "multi":
		case "person":
		case "relation": {
			const labels = (v as string[]).map((s) => p.options.find((o) => o.value === s)?.label ?? s)
			return labels.join(", ")
		}
		case "date":
			if (rule.operator === "between") {
				const r = (v ?? {}) as DateRange
				return `${dateRefLabel(r.start)} → ${dateRefLabel(r.end)}`
			}
			if (rule.operator === "relative") return relativeLabel(v as RelativeDate)
			return dateRefLabel(v as DateRef)
		case "number":
			return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v).toLocaleString("en") : String(v ?? "")
		default:
			return String(v ?? "")
	}
}

/** Chip text, Notion style: "Status: Done, Blocked", "Name contains: x". */
export function chipLabel(rule: Rule, p: FilterProperty): { name: string; rest: string } {
	if (!isActive(rule, p)) return { name: p.name, rest: "" }
	const op = rule.operator
	if (isEmptyOp(op)) return { name: p.name, rest: `: ${op === "empty" ? "Is empty" : "Is not empty"}` }
	const val = valueSummary(rule, p)
	const plainOps: Operator[] = ["is", "contains"]
	if (p.kind === "number") return { name: p.name, rest: ` ${operatorLabel(op, p.kind)} ${val}` }
	if (p.kind === "checkbox") return { name: p.name, rest: `: ${op === "is_not" ? "Not " + val.toLowerCase() : val}` }
	if (plainOps.includes(op)) return { name: p.name, rest: `: ${val}` }
	const opText = operatorLabel(op, p.kind)
	return { name: p.name, rest: ` ${opText}: ${val}` }
}
