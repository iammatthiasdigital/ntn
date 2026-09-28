/**
 * The vibe check: one encouraging line about the burn, in developer-meme
 * style but readable by anyone who has sat through a sprint review.
 * Picked from the state of the chart, and stable for the day.
 */
import type { Burn } from "./burn"

export type Tone = "party" | "good" | "meh" | "bad"
export type Vibe = { emoji: string; title: string; line: string; tone: Tone }

const LINES: Record<string, { emoji: string; title: string; lines: string[]; tone: Tone }> = {
	done: {
		emoji: "🚢",
		title: "Shipped!",
		tone: "party",
		lines: [
			"100% done. It works on everyone's machine now, not just mine.",
			"Zero tickets left. Go touch grass, you've earned it.",
			"All done. The retro can be one slide: a party emoji.",
		],
	},
	ahead: {
		emoji: "🚀",
		title: "Ahead of schedule",
		tone: "good",
		lines: [
			"Forecast lands {weeks} before the target. Screenshot this before someone adds scope.",
			"{weeks} early. Estimates were padded or the team is cracked. Either way: nice.",
			"Beating the deadline by {weeks}. Even the Gantt chart is jealous.",
		],
	},
	onTrack: {
		emoji: "📈",
		title: "Up and to the right",
		tone: "good",
		lines: [
			"On track. The line goes up, just like in the pitch deck.",
			"Steady pace, no fires. This is what 'boring' looks like when it's good.",
			"On track for the target. Nobody panic, especially not the PM.",
		],
	},
	noTarget: {
		emoji: "🔮",
		title: "Forecast: {forecast}",
		tone: "good",
		lines: [
			"At this pace, done by {forecast}. Set a target and we'll tell you if that's good.",
			"The crystal ball says {forecast}. Accuracy ±1 standup.",
		],
	},
	late: {
		emoji: "🐢",
		title: "Running {weeks} behind",
		tone: "meh",
		lines: [
			"{weeks} late at the current pace. Not a bug, it's a scheduling feature.",
			"Forecast misses the target by {weeks}. Time for the 'scope vs. date' talk.",
			"{weeks} behind. Cutting scope beats adding meetings, every time.",
		],
	},
	veryLate: {
		emoji: "🔥",
		title: "This is fine",
		tone: "bad",
		lines: [
			"{weeks} past the target at this pace. The room is on fire; the coffee is still warm.",
			"The forecast has left the building ({weeks} late). Re-plan now, cry later.",
		],
	},
	creep: {
		emoji: "🐇",
		title: "Scope is multiplying",
		tone: "meh",
		lines: [
			"Scope grew {creep} lately. The backlog is breeding faster than we close tickets.",
			"+{creep} scope recently. 'Just one more small thing' has entered the chat.",
		],
	},
	stalled: {
		emoji: "🧊",
		title: "Velocity: 0",
		tone: "bad",
		lines: [
			"Nothing closed lately. Have you tried turning the sprint off and on again?",
			"The done line is flatter than the office coffee. Anything blocked?",
		],
	},
	fresh: {
		emoji: "🌱",
		title: "Just getting started",
		tone: "good",
		lines: ["{done} of the way. Every burn-up starts at zero; the fun part is next."],
	},
}

function pick<T>(xs: T[], seed: string): T {
	let h = 0
	for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0
	return xs[Math.abs(h) % xs.length]
}

const weeksTxt = (days: number) => {
	const w = Math.round(Math.abs(days) / 7)
	return w <= 1 ? (Math.abs(days) <= 7 ? `${Math.max(1, Math.abs(days))} day${Math.abs(days) === 1 ? "" : "s"}` : "1 week") : `${w} weeks`
}

export function vibe(B: Burn, fmtDate: (d: number) => string): Vibe {
	const left = B.scopeNow - B.doneNow
	const pct = B.scopeNow ? B.doneNow / B.scopeNow : 0
	const creep = B.windowStart.scope ? (B.scopeNow - B.windowStart.scope) / B.windowStart.scope : 0
	const late = B.target != null && B.forecast != null ? B.forecast - B.target : null
	let key: keyof typeof LINES
	if (B.scopeNow > 0 && left <= 0) key = "done"
	else if (B.velocity <= 0) key = pct < 0.05 ? "fresh" : "stalled"
	else if (creep > 0.2) key = "creep"
	else if (late == null) key = "noTarget"
	else if (late < -7) key = "ahead"
	else if (late <= 3) key = "onTrack"
	else if (late <= 28) key = "late"
	else key = "veryLate"
	const L = LINES[key]
	const fill = (s: string) =>
		s
			.replace("{weeks}", late != null ? weeksTxt(late) : "")
			.replace("{forecast}", B.forecast != null ? fmtDate(B.forecast) : "")
			.replace("{creep}", `${Math.round(creep * 100)}%`)
			.replace("{done}", `${Math.round(pct * 100)}%`)
	const seed = `${key}:${B.today}`
	return { emoji: L.emoji, title: fill(L.title), line: fill(pick(L.lines, seed)), tone: L.tone }
}

/** Milestones crossed (25/50/75/100% of the current scope). */
export function milestones(B: Burn): { pct: number; t: number }[] {
	const out: { pct: number; t: number }[] = []
	for (const pct of [25, 50, 75, 100]) {
		const need = (B.scopeNow * pct) / 100
		const p = B.points.find((x) => x.done >= need - 1e-9 && need > 0)
		if (p) out.push({ pct, t: p.t })
	}
	return out
}
