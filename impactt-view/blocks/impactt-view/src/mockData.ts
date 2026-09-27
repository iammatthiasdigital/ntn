/**
 * Standalone harness data: the dev-shell seed files turned into the same
 * source snapshots the Notion host delivers — schema options with colors,
 * status groups, and the four built-in properties — plus an in-memory
 * writer so edits in the table round-trip like they do in Notion.
 */
import initiativesSeed from "../../../data/worker_initiatives.json"
import kpisSeed from "../../../data/worker_kpis.json"
import impactsSeed from "../../../data/worker_impacts.json"
import type { SchemaLike } from "./filters/core"
import type { SourceRow, SourceSnapshot, Sources } from "./dataset"
import { GROWTH_NAMES, lastDayOf, TIMING_NAMES, type Writer } from "./sources"

type Seed = {
	schema: Record<string, { name: string; type: string }>
	rows: ({ id: string } & Record<string, unknown>)[]
}

const COLORS = ["blue", "green", "orange", "purple", "pink", "red", "yellow", "brown", "gray"]
const STATUS_GROUPS = [
	{ id: "g-todo", name: "To-do", color: "gray", match: /not started|to.?do|backlog/i },
	{ id: "g-prog", name: "In progress", color: "blue", match: /progress|doing|review/i },
	{ id: "g-done", name: "Complete", color: "green", match: /done|complete|shipped/i },
]
const STATUS_COLORS: Record<string, string> = { "g-todo": "default", "g-prog": "blue", "g-done": "green" }

export const MOCK_USERS: Record<string, string> = {
	"user-ada-lovelace": "Ada Lovelace",
	"user-grace-hopper": "Grace Hopper",
	"user-alan-turing": "Alan Turing",
	"user-margaret-hamilton": "Margaret Hamilton",
	"user-hedy-lamarr": "Hedy Lamarr",
	"user-radia-perlman": "Radia Perlman",
}
export const MOCK_ME = "user-ada-lovelace"

function toSnapshot(seed: Seed, withBuiltins: boolean): SourceSnapshot {
	const schemas: Record<string, SchemaLike> = {}
	for (const [key, s] of Object.entries(seed.schema)) {
		const sch: SchemaLike = { name: s.name, type: s.type }
		if (s.type === "select" || s.type === "multi_select" || s.type === "status") {
			const names: string[] = []
			for (const r of seed.rows) {
				const v = r[key]
				for (const n of Array.isArray(v) ? v : typeof v === "string" ? [v] : []) if (typeof n === "string" && !names.includes(n)) names.push(n)
			}
			if (s.type === "status") {
				const opts = names.map((n, i) => ({ id: `${key}-${i}`, name: n, group: STATUS_GROUPS.find((g) => g.match.test(n))?.id ?? "g-todo" }))
				sch.options = opts.map((o) => ({ id: o.id, name: o.name, color: STATUS_COLORS[o.group] }))
				sch.groups = STATUS_GROUPS.map((g) => ({ id: g.id, name: g.name, color: g.color, option_ids: opts.filter((o) => o.group === g.id).map((o) => o.id) }))
			} else {
				sch.options = names.map((n, i) => ({ id: `${key}-${i}`, name: n, color: COLORS[i % COLORS.length] }))
			}
		}
		schemas[key] = sch
	}
	if (withBuiltins) {
		schemas.created_time = { name: "Created time", type: "created_time" }
		schemas.last_edited_time = { name: "Last edited time", type: "last_edited_time" }
		schemas.created_by = { name: "Created by", type: "created_by" }
		schemas.last_edited_by = { name: "Last edited by", type: "last_edited_by" }
	}
	const users = Object.keys(MOCK_USERS)
	const items: SourceRow[] = seed.rows.map((r, i) => {
		const { id, ...values } = r
		const byId: Record<string, unknown> = { ...values }
		if (withBuiltins) {
			const day = String(1 + ((i * 3) % 27)).padStart(2, "0")
			byId.created_time = { type: "datetime", start_date: `2026-0${1 + (i % 8)}-${day}`, start_time: "09:30" }
			byId.last_edited_time = { type: "datetime", start_date: `2026-09-${String(10 + i).padStart(2, "0")}`, start_time: "16:05" }
			byId.created_by = [{ id: users[i % users.length], table: "notion_user" }]
			byId.last_edited_by = [{ id: users[(i + 2) % users.length], table: "notion_user" }]
		}
		return { id, propertiesById: byId, propertiesByKey: { ...values } }
	})
	const propertyIdsByKey: Record<string, string> = {}
	for (const key of Object.keys(seed.schema)) propertyIdsByKey[key] = key
	return { bound: true, items, propertySchemasById: schemas, propertyIdsByKey, truncated: false }
}

export function mockSources(): Sources {
	return {
		initiatives: toSnapshot(initiativesSeed as Seed, true),
		kpis: toSnapshot(kpisSeed as Seed, false),
		impacts: toSnapshot(impactsSeed as Seed, false),
	}
}

export function mockTitle(src: Sources, id: string): string | undefined {
	for (const s of [src.initiatives, src.kpis, src.impacts]) {
		const row = s.items.find((r) => r.id === id)
		if (row && typeof row.propertiesByKey.name === "string") return row.propertiesByKey.name
	}
	return undefined
}

/** In-memory writer for the harness: patches one property of one row. */
export function mockWriter(setSources: (f: (s: Sources) => Sources) => void): Writer {
	const patch = (which: keyof Sources, rowId: string, key: string, value: unknown) =>
		setSources((s) => {
			const snap = s[which]
			const items = snap.items.map((r) => {
				if (r.id !== rowId) return r
				const byKey = { ...r.propertiesByKey }
				const byId = { ...r.propertiesById }
				if (value === undefined) {
					delete byKey[key]
					delete byId[key]
				} else {
					byKey[key] = value
					byId[key] = value
				}
				return { ...r, propertiesByKey: byKey, propertiesById: byId }
			})
			return { ...s, [which]: { ...snap, items } }
		})
	return {
		setTiming: async (id, v) => (patch("initiatives", id, "timing", v ? TIMING_NAMES[v] : undefined), null),
		setGrowth: async (id, v) => (patch("initiatives", id, "growth", GROWTH_NAMES[v]), null),
		setGoal: async (id, v) => (patch("kpis", id, "goal", v ?? undefined), null),
		setGoalBy: async (id, ym) => (patch("kpis", id, "goalBy", { type: "date", start_date: lastDayOf(ym) }), null),
	}
}
