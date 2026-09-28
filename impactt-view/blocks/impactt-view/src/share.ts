/**
 * View codes: a block's view (filters and settings) as a short text that can
 * be pasted into the same block elsewhere, so a team starts from the same
 * view. Pure and offline — the code carries the settings and nothing else.
 *
 * Imports are untrusted input: the code is size-limited, parsed as JSON,
 * stripped of prototype keys, and merged field by field over the block's
 * defaults (a field is taken only when its shape matches the default's).
 * Property ids are portable: the code names every property it mentions, so
 * a view made on one database re-targets the same-named properties of
 * another.
 */
import { EMPTY_FILTERS, type FilterState, type SchemaLike } from "./filters/core"

const PREFIX = "ntnview"
const VERSION = 1
/** Upper bound for a pasted code (a view is a few KB at most). */
export const MAX_CODE = 100_000

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

type Payload = {
	/** Block kind, e.g. "orgchart". */
	b: string
	v: number
	/** The view. */
	view: Json
	/** Property id → name, for every property id the view mentions. */
	props: Record<string, string>
	/** Block-specific extras (e.g. whiteboard drawings), opaque here. */
	extra?: Json
}

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"])

/** A JSON-only deep copy without prototype keys; drops anything else. */
export function clean(v: unknown, depth = 0): Json | undefined {
	if (depth > 32) return undefined
	if (v === null || typeof v === "boolean" || typeof v === "string") return v
	if (typeof v === "number") return Number.isFinite(v) ? v : undefined
	if (Array.isArray(v)) return v.map((e) => clean(e, depth + 1)).filter((e): e is Json => e !== undefined)
	if (typeof v === "object") {
		const out: { [k: string]: Json } = Object.create(null)
		for (const [k, e] of Object.entries(v as Record<string, unknown>)) {
			if (FORBIDDEN.has(k)) continue
			const c = clean(e, depth + 1)
			if (c !== undefined) out[k] = c
		}
		return { ...out }
	}
	return undefined
}

function toBase64Url(s: string): string {
	const bytes = new TextEncoder().encode(s)
	let bin = ""
	for (const b of bytes) bin += String.fromCharCode(b)
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(s: string): string {
	const b64 = s.replace(/-/g, "+").replace(/_/g, "/")
	const bin = atob(b64 + "===".slice((b64.length + 3) % 4))
	return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** Every string in `v` (deep). */
function strings(v: Json, out = new Set<string>()): Set<string> {
	if (typeof v === "string") out.add(v)
	else if (Array.isArray(v)) for (const e of v) strings(e, out)
	else if (v && typeof v === "object") for (const e of Object.values(v)) strings(e, out)
	return out
}

/** Replaces strings (deep) through `map`. */
function remap(v: Json, map: ReadonlyMap<string, string>): Json {
	if (typeof v === "string") return map.get(v) ?? v
	if (Array.isArray(v)) return v.map((e) => remap(e, map))
	if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, e]) => [map.get(k) ?? k, remap(e, map)]))
	return v
}

export type Schemas = Record<string, SchemaLike>

/** The view as a code. `schemas` names the properties the view refers to. */
export function encodeView(block: string, view: object, schemas: Schemas, extra?: unknown): string {
	const clean_ = clean(view) ?? {}
	const used = strings(clean_)
	const props: Record<string, string> = {}
	for (const [id, s] of Object.entries(schemas)) if (used.has(id) && s.name) props[id] = s.name
	const payload: Payload = { b: block, v: VERSION, view: clean_, props }
	const x = extra === undefined ? undefined : clean(extra)
	if (x !== undefined) payload.extra = x
	return `${PREFIX}:${block}:${toBase64Url(JSON.stringify(payload))}`
}

export type Decoded<T> =
	| {
			ok: true
			view: T
			extra?: unknown
			/** Properties matched by name on this database (ids differed). */
			renamed: number
			/** Properties the code mentions that this database doesn't have. */
			missing: string[]
			/** Filter rules dropped because their property is missing. */
			droppedRules: number
	  }
	| { ok: false; error: string }

const isPrim = (v: unknown) => v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean"

/** Whether an imported value `b` may replace the default `a`. */
function sameShape(a: unknown, b: unknown, depth = 0): boolean {
	if (depth > 4) return false
	// Nullable defaults (e.g. "no property picked") take a primitive.
	if (a === null) return isPrim(b)
	if (b === null) return false
	if (Array.isArray(a)) {
		if (!Array.isArray(b) || b.length > 500) return false
		return a.length ? b.every((e) => sameShape(a[0], e, depth + 1)) : b.every(isPrim)
	}
	if (typeof a === "object") {
		if (typeof b !== "object" || Array.isArray(b)) return false
		// Records keyed by id (per-property settings): values shaped like any default value, or primitives.
		const sample = Object.values(a as object)[0]
		return Object.values(b as object).every((e) => (sample === undefined ? isPrim(e) : sameShape(sample, e, depth + 1)))
	}
	return typeof a === typeof b
}

/** Keeps only well-formed filter rules/groups on known properties. */
function cleanFilters(v: unknown, known: (id: string) => boolean): { filters: FilterState; dropped: number } {
	let dropped = 0
	const OPS = /^[a-z_]{1,24}$/
	const node = (n: unknown, depth: number): FilterState["rules"][number] | NonNullable<FilterState["advanced"]> | null => {
		if (!n || typeof n !== "object" || depth > 6) return null
		const o = n as Record<string, unknown>
		const id = typeof o.id === "string" && o.id.length < 80 ? o.id : `f${Math.random().toString(36).slice(2, 9)}`
		if (o.kind === "rule") {
			if (typeof o.propertyId !== "string" || typeof o.operator !== "string" || !OPS.test(o.operator)) return null
			if (!known(o.propertyId)) {
				dropped++
				return null
			}
			return { kind: "rule", id, propertyId: o.propertyId, operator: o.operator as never, value: (o.value ?? null) as never }
		}
		if (o.kind === "group") {
			const children = (Array.isArray(o.children) ? o.children : []).map((c) => node(c, depth + 1)).filter((c): c is NonNullable<typeof c> => c !== null)
			return { kind: "group", id, conjunction: o.conjunction === "or" ? "or" : "and", children }
		}
		return null
	}
	const f = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
	const rules = (Array.isArray(f.rules) ? f.rules : []).map((r) => node(r, 0)).filter((r): r is FilterState["rules"][number] => r?.kind === "rule")
	const adv = node(f.advanced, 0)
	return { filters: { ...EMPTY_FILTERS, rules, advanced: adv?.kind === "group" && adv.children.length ? adv : null }, dropped }
}

/**
 * Reads a code for `block` into a view over `defaults`. Ids the code names
 * are matched to this block's properties: same id first, then same name.
 */
export function decodeView<T extends object>(raw: string, block: string, defaults: T, schemas: Schemas): Decoded<T> {
	const code = raw.trim()
	if (!code) return { ok: false, error: "Paste a view code first." }
	if (code.length > MAX_CODE) return { ok: false, error: "That code is too long to be a view." }
	const m = /^ntnview:([a-z0-9-]{1,40}):([A-Za-z0-9_-]+)$/.exec(code.replace(/\s+/g, ""))
	if (!m) return { ok: false, error: "That isn't a view code. It should start with “ntnview:”." }
	if (m[1] !== block) return { ok: false, error: `That code is for a different block (${m[1]}).` }
	let payload: Payload
	try {
		const parsed = clean(JSON.parse(fromBase64Url(m[2])))
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape")
		payload = parsed as unknown as Payload
	} catch {
		return { ok: false, error: "That code is damaged. Copy it again, in full." }
	}
	if (payload.b !== block || typeof payload.v !== "number") return { ok: false, error: "That code is damaged. Copy it again, in full." }
	if (payload.v > VERSION) return { ok: false, error: "That code comes from a newer version of this block." }
	const view = payload.view && typeof payload.view === "object" && !Array.isArray(payload.view) ? payload.view : {}
	const props = payload.props && typeof payload.props === "object" && !Array.isArray(payload.props) ? payload.props : {}

	// Re-target property ids: same id if this database has it, else the same name.
	const byName = new Map<string, string>()
	for (const [id, s] of Object.entries(schemas)) if (s.name && !byName.has(s.name.toLowerCase())) byName.set(s.name.toLowerCase(), id)
	const idMap = new Map<string, string>()
	const missing: string[] = []
	let renamed = 0
	for (const [id, name] of Object.entries(props)) {
		if (typeof name !== "string") continue
		if (schemas[id]) continue
		const local = byName.get(name.toLowerCase())
		if (local) {
			idMap.set(id, local)
			renamed++
		} else missing.push(name)
	}
	const moved = remap(view, idMap) as Record<string, Json>

	const out = { ...defaults } as Record<string, unknown>
	for (const [k, dv] of Object.entries(defaults)) {
		if (k === "filters" || !(k in moved)) continue
		if (sameShape(dv, moved[k])) out[k] = moved[k]
	}
	let droppedRules = 0
	if ("filters" in defaults) {
		const { filters, dropped } = cleanFilters(moved.filters, (id) => !!schemas[id])
		out.filters = filters
		droppedRules = dropped
	}
	return { ok: true, view: out as T, extra: payload.extra, renamed, missing, droppedRules }
}

/** A readable one-liner of what a code holds, for the import preview. */
export function describe(view: { filters?: FilterState }, defaults: object): string {
	const n = view.filters ? view.filters.rules.length + (view.filters.advanced ? 1 : 0) : 0
	const changed = Object.entries(defaults).filter(([k, v]) => k !== "filters" && k !== "filterBar" && JSON.stringify((view as Record<string, unknown>)[k]) !== JSON.stringify(v)).length
	const parts = [view.filters ? (n ? `${n} filter${n > 1 ? "s" : ""}` : "no filters") : "", changed ? `${changed} setting${changed > 1 ? "s" : ""} changed` : "default settings"].filter(Boolean)
	return parts.join(" · ")
}

/* ---- helpers for a block's `sanitize` ---- */

/** `v` when it's one of `allowed`, else `d`. */
export const oneOf = <T>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d)
/** A finite number clamped to [lo, hi], else `d`. */
export const within = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
/** A `YYYY-MM-DD` string, else "". */
export const isoDay = (v: unknown): string => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "")
