/**
 * The film's score, synthesised: upbeat marimba pop at 150 bpm, written to
 * the cue sheet in cues.js so its hits land on the animation (pills and
 * chips pop on notes, the title and the gap land on a crash, the today sweep
 * and the projection ride a riser). Writes a 48 kHz stereo WAV.
 *
 *   node docs/video/score.mjs out.wav
 */
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import "./cues.js"

const Q = globalThis.IMPACTT_CUES
const T = Q.scene
const SR = 48000
const BAR = 1.6
const E8 = BAR / 8

const hz = (m) => 440 * 2 ** ((m - 69) / 12)

/** Per chord: bass note, triad, and the hook as [eighth, note]. */
const CHORD = {
	C: { bass: 36, tri: [60, 64, 67], hook: [[0, 76], [2, 79], [3, 76], [5, 74], [6, 72]] },
	G: { bass: 31, tri: [59, 62, 67], hook: [[0, 74], [2, 79], [3, 74], [5, 71], [6, 74]] },
	Am: { bass: 33, tri: [60, 64, 69], hook: [[0, 76], [2, 81], [3, 76], [5, 74], [6, 72]] },
	F: { bass: 29, tri: [60, 65, 69], hook: [[0, 69], [2, 72], [3, 77], [5, 76], [6, 74]] },
	Dm: { bass: 38, tri: [62, 65, 69], hook: [] },
}
/** One chord per 1.6 s bar. The title (bar 14) and the end card (bar 38) resolve to C. */
const BARS = "C G Am F C G Am F C G Am F Dm G C G C G Am F C G Am F C G Am F C G Am F C G Am F G G C C C C C".split(" ")
const PENTA = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93]

/** What the band plays at second t. */
const section = (t) =>
	t < T.B ? "intro"
	: t < T.C ? "lift"
	: t < T.E ? "verse"
	: t < T.F ? "question"
	: t < Q.title ? "build"
	: t < T.G4 ? "chorus"
	: t < Q.sweep[1] ? "clock"
	: t < T.H ? "chorus"
	: t < T.I ? "hush"
	: t < Q.gap ? "drive"
	: t < T.J ? "held"
	: t < T.K ? "drop"
	: t < Q.lastChord ? "chorus"
	: "tail"

export function writeScore(file, seconds = Q.duration) {
	const N = Math.round(seconds * SR)
	const stereo = () => [new Float32Array(N), new Float32Array(N)]
	const drums = stereo()
	const music = stereo()
	const pad = stereo()
	const send = stereo()
	const bass = new Float32Array(N)
	const kicks = []
	let seed = 11
	const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1

	/* ---------- voices ---------- */

	/** A struck tone: partials as [ratio, level, decay relative to tau]. */
	function tone(t0, m, vel, parts, tau, pan = 0.5, wet = 0.3) {
		const f = hz(m)
		const gl = Math.cos((pan * Math.PI) / 2)
		const gr = Math.sin((pan * Math.PI) / 2)
		const i0 = Math.round(t0 * SR)
		const len = Math.min(N - i0, Math.round(Math.min(tau * 7, 5) * SR))
		const ps = parts.map(([ratio, a, k]) => ({ w: (2 * Math.PI * f * ratio) / SR, a: a * vel, d: Math.exp(-1 / (tau * k * SR)) })).filter((p) => p.w < 2.4)
		for (let i = 0; i < len; i++) {
			let v = 0
			for (const p of ps) {
				v += Math.sin(p.w * i) * p.a
				p.a *= p.d
			}
			if (i < 72) v *= i / 72
			music[0][i0 + i] += v * gl
			music[1][i0 + i] += v * gr
			send[0][i0 + i] += v * gl * wet
			send[1][i0 + i] += v * gr * wet
		}
	}
	const marimba = (t, m, vel, pan = 0.5, wet = 0.25) => tone(t, m, vel * 0.2, [[1, 1, 1], [4, 0.3, 0.2], [9.2, 0.1, 0.06]], 0.3 * (440 / hz(m)) ** 0.4, pan, wet)
	const lead = (t, m, vel, pan = 0.5) => tone(t, m, vel * 0.17, [[1, 1, 1], [2, 0.5, 0.55], [3, 0.24, 0.38], [4, 0.12, 0.28], [6, 0.05, 0.18]], 0.3 * (440 / hz(m)) ** 0.3, pan, 0.35)
	const bell = (t, m, vel) => tone(t, m, vel * 0.13, [[1, 1, 1], [2.76, 0.4, 0.6], [5.4, 0.2, 0.35]], 0.75, 0.5, 0.55)
	const chord = (t, notes, vel, wet) => notes.forEach((m, j) => marimba(t + j * 0.004, m, vel, 0.32 + j * 0.18, wet))

	/** The small "pop" of something appearing: a quick upward chirp. */
	function pop(t0, vel = 1, f0 = 520) {
		const i0 = Math.round(t0 * SR)
		let ph = 0
		for (let i = 0; i < 0.12 * SR && i0 + i < N; i++) {
			const t = i / SR
			ph += (2 * Math.PI * f0 * (1 + 1.3 * Math.min(1, t / 0.04))) / SR
			const v = Math.sin(ph) * Math.exp(-t / 0.028) * Math.min(1, i / 48) * vel * 0.16
			music[0][i0 + i] += v
			music[1][i0 + i] += v
			send[0][i0 + i] += v * 0.3
			send[1][i0 + i] += v * 0.3
		}
	}

	function kick(t0, vel = 1) {
		kicks.push([t0, vel])
		const i0 = Math.round(t0 * SR)
		let ph = 0
		for (let i = 0; i < 0.45 * SR && i0 + i < N; i++) {
			const t = i / SR
			ph += (2 * Math.PI * (46 + 130 * Math.exp(-t / 0.028))) / SR
			const v = (Math.sin(ph) * Math.exp(-t / 0.17) + rnd() * 0.22 * Math.exp(-t / 0.0025)) * vel * 0.8
			drums[0][i0 + i] += v
			drums[1][i0 + i] += v
		}
	}
	/** A low thud under the big moments. */
	function boom(t0, vel = 1) {
		const i0 = Math.round(t0 * SR)
		let ph = 0
		for (let i = 0; i < 2.2 * SR && i0 + i < N; i++) {
			const t = i / SR
			ph += (2 * Math.PI * (40 + 60 * Math.exp(-t / 0.07))) / SR
			const v = Math.tanh(Math.sin(ph) * 1.6) * Math.exp(-t / 0.55) * vel * 0.55
			drums[0][i0 + i] += v
			drums[1][i0 + i] += v
		}
	}
	/** Filtered noise (state-variable filter); fc may move over time. */
	function noise(bus, t0, dur, { fc, q = 1, out = "band", env, gain = 1, wet = 0 }) {
		const i0 = Math.round(t0 * SR)
		const len = Math.round(dur * SR)
		for (let ch = 0; ch < 2; ch++) {
			let low = 0
			let band = 0
			for (let i = 0; i < len && i0 + i < N; i++) {
				const t = i / SR
				const f = 2 * Math.sin((Math.PI * Math.min(typeof fc === "function" ? fc(t) : fc, 7400)) / SR)
				low += f * band
				const high = rnd() - low - q * band
				band += f * high
				const y = (out === "band" ? band : out === "high" ? high : low) * env(t) * gain
				if (i0 + i < 0) continue
				bus[ch][i0 + i] += y
				if (wet) send[ch][i0 + i] += y * wet
			}
		}
	}
	const clap = (t, vel = 1) => noise(drums, t, 0.4, { fc: 1500, q: 0.9, env: (x) => (x < 0.03 ? Math.exp(-(x % 0.01) / 0.0035) : Math.exp(-(x - 0.03) / 0.075)), gain: 0.2 * vel, wet: 0.35 })
	const snap = (t, vel = 1) => noise(drums, t, 0.2, { fc: 2600, q: 0.7, env: (x) => Math.exp(-x / 0.03), gain: 0.13 * vel, wet: 0.5 })
	const hat = (t, vel = 1, open = false) => noise(drums, t, open ? 0.4 : 0.12, { fc: 7000, q: 0.8, out: "high", env: (x) => Math.exp(-x / (open ? 0.09 : 0.02)), gain: 0.085 * vel })
	const crash = (t, vel = 1) => noise(drums, t, 3, { fc: 5200, q: 0.8, out: "high", env: (x) => Math.exp(-x / 0.6), gain: 0.13 * vel, wet: 0.5 })
	/** Noise sweeping up into a cue. */
	const riser = (t0, t1, vel = 1) => noise(music, t0, t1 - t0, { fc: (x) => 350 * 20 ** (x / (t1 - t0)), q: 0.6, env: (x) => (x / (t1 - t0)) ** 2.2, gain: 0.11 * vel, wet: 0.4 })
	const whoosh = (t0, t1, vel = 1) => noise(music, t0, t1 - t0, { fc: (x) => 500 + 3200 * Math.sin((Math.PI * x) / (t1 - t0)), q: 0.7, env: (x) => Math.sin((Math.PI * x) / (t1 - t0)) ** 2, gain: 0.07 * vel, wet: 0.4 })
	/** Claps speeding up into a cue. */
	const roll = (t0, t1) => {
		for (let t = t0, n = 0; t < t1 - 0.01; n++) {
			const p = (t - t0) / (t1 - t0)
			clap(t, 0.45 + 0.55 * p)
			t += p < 0.5 ? 0.2 : 0.1
		}
	}

	function bassNote(t0, m, dur, vel = 1) {
		const w = (2 * Math.PI * hz(m)) / SR
		const i0 = Math.round(t0 * SR)
		for (let i = 0; i < (dur + 0.05) * SR && i0 + i < N; i++) {
			const t = i / SR
			const env = Math.min(1, t / 0.004) * (0.4 + 0.6 * Math.exp(-t / 0.3)) * (t > dur ? Math.max(0, 1 - (t - dur) / 0.05) : 1)
			bass[i0 + i] += Math.tanh((Math.sin(w * i) + 0.45 * Math.sin(2 * w * i) + 0.2 * Math.sin(3 * w * i)) * env * 1.4) * vel * 0.3
		}
	}
	function padChord(t0, dur, notes, vel) {
		const i0 = Math.round(t0 * SR)
		notes.forEach((m, j) => {
			for (const det of [-0.0035, 0.0035]) {
				const w = (2 * Math.PI * hz(m) * (1 + det)) / SR
				const g = (det < 0) === (j % 2 === 0) ? [0.85, 0.5] : [0.5, 0.85]
				for (let i = 0; i < (dur + 0.5) * SR && i0 + i < N; i++) {
					const t = i / SR
					const v = (Math.sin(w * i) + 0.22 * Math.sin(2 * w * i)) * Math.min(1, t / 0.35) * (t > dur ? Math.max(0, 1 - (t - dur) / 0.5) : 1) * vel * 0.02
					pad[0][i0 + i] += v * g[0]
					pad[1][i0 + i] += v * g[1]
					send[0][i0 + i] += v * g[0] * 0.5
					send[1][i0 + i] += v * g[1] * 0.5
				}
			}
		})
	}

	/* ---------- the band, eighth by eighth ---------- */

	const PAD = { intro: 1, lift: 1, verse: 0.6, question: 1.1, build: 1.1, chorus: 0.7, clock: 0.9, hush: 0.45, drive: 0.8, held: 1.1, drop: 1.1, tail: 0 }
	const LONG_BASS = new Set(["lift", "question", "build", "clock", "held", "drop"])
	for (let n = 0; n * E8 < seconds; n++) {
		const t = n * E8
		const b = Math.floor(n / 8)
		const k = n % 8
		const c = CHORD[BARS[b]]
		const sec = section(t)
		const first = k === 0 || section(t - E8) !== sec
		if (sec === "tail") break

		if (k === 0 && PAD[sec]) padChord(t, BAR, [c.tri[0] - 12, ...c.tri], PAD[sec])
		if (first && LONG_BASS.has(sec)) bassNote(t, c.bass + 12, BAR - k * E8 - 0.08, 0.8)

		if (sec === "intro") {
			if (k === 0) chord(t + (b ? 0 : 0.2), c.tri, 0.7, 0.4)
			if (b && (k === 2 || k === 6)) snap(t, 0.8)
		} else if (sec === "lift") {
			if (k % 3 === 0 && k < 7) chord(t, c.tri, k ? 0.5 : 0.7)
			if (k === 2 || k === 6) snap(t)
			// Into the beat.
			if (t >= T.C - 0.8) {
				hat(t, 0.5 + (t - (T.C - 0.8)) * 0.7)
				hat(t + 0.1, 0.4 + (t - (T.C - 0.8)) * 0.7)
			}
		} else if (sec === "verse" || sec === "chorus") {
			const full = sec === "chorus"
			if (k === 0 || k === 4) kick(t)
			if (full && k === 7 && b % 2) kick(t, 0.7)
			if (k === 2 || k === 6) clap(t)
			if (k % 2) hat(t, 1, full && k === 7)
			else if (full) hat(t, 0.55)
			if (k % 3 === 0 && k < 7) {
				bassNote(t, c.bass + 12 + (k === 6 ? 12 : 0), k === 6 ? 0.16 : 0.3, k ? 0.85 : 1)
				chord(t, c.tri, k ? 0.6 : 0.8)
			}
			if (full && k === 7) bassNote(t, c.bass + 12, 0.14, 0.7)
			// The hook; the second time round the phrase it drops an octave.
			if (full) for (const [at, m] of c.hook) if (at === k) b >= 20 && b < 23 ? marimba(t, m - 12, 1.1, 0.6) : lead(t, m, at ? 0.8 : 1, 0.55)
		} else if (sec === "question") {
			if (k === 2 || k === 6) snap(t, 0.7)
		} else if (sec === "build") {
			if (k === 2 || k === 6) snap(t)
		} else if (sec === "clock") {
			// Time passing: sixteenth ticks that swell as today sweeps in.
			const p = (t - T.G4) / (Q.sweep[1] - T.G4)
			hat(t, 0.5 + 0.7 * p)
			hat(t + 0.1, 0.3 + 0.6 * p)
			if (k === 2 || k === 6) snap(t, 0.8)
		} else if (sec === "drive") {
			if (k % 2 === 0) kick(t, 0.9)
			if (k === 2 || k === 6) clap(t, 0.9)
			hat(t, k % 2 ? 1 : 0.55)
			bassNote(t, c.bass + 12, 0.15, k % 2 ? 0.7 : 0.95)
			if (k % 3 === 0 && k < 7) chord(t, c.tri, k ? 0.6 : 0.8)
		} else if (sec === "held") {
			hat(t, k % 2 ? 0.5 : 0.3)
		}
	}

	/* ---------- on the animation ---------- */

	const run = (at, step, count, from, dir = 1) => Array.from({ length: count }, (_, i) => [at + i * step, PENTA[from + dir * i], i])
	const ticks = ([a, z], from) => {
		const n = Math.round((z - a) / 0.1)
		for (let i = 0; i < n; i++) marimba(a + i * 0.1, PENTA[from + Math.round((i / (n - 1)) * 8)], 0.45 + 0.35 * (i / n), 0.4 + 0.2 * (i % 2))
		bell(z, 88, 1)
	}

	// A: the goal pill and its number counting up.
	pop(Q.goalPill, 1)
	lead(Q.goalPill, 79, 0.9)
	ticks(Q.goalCount, 5)
	// B: six pills, six notes up.
	for (const [t, m, i] of run(Q.pills.at, Q.pills.step, 6, 5)) {
		pop(t, 0.8, 480 + i * 60)
		lead(t, m, 0.8, 0.35 + i * 0.06)
	}
	// C: six roadmap rows, six notes down.
	for (const [t, m, i] of run(Q.rows.at, Q.rows.step, 6, 10, -1)) lead(t, m, 0.75, 0.35 + i * 0.06)
	// D: the KPI card and its number.
	pop(Q.kpiCard, 1)
	ticks(Q.kpiCount, 3)
	// E: the question, left hanging.
	chord(T.E, [57, 64, 69, 72], 0.9, 0.5)
	;[76, 79, 81].forEach((m, i) => lead(T.E + 1.6 + i * 0.2, m, 0.8))
	// F: three charts in, a roll while they merge, and the title lands.
	;[74, 77, 81].forEach((m, i) => {
		const t = Q.cards.at + i * Q.cards.step
		kick(t, 0.85)
		pop(t, 1, 480 + i * 90)
		lead(t, m, 0.95)
	})
	roll(Q.merge[0] - 0.8, Q.title)
	riser(Q.merge[0] - 0.4, Q.title)
	crash(Q.title, 1)
	bell(Q.title, 84, 1)
	// G: brackets, the morph, the goal flag.
	crash(T.G, 0.6)
	pop(Q.widthBracket, 0.9, 600)
	whoosh(Q.morph[0] - 0.1, Q.morph[1])
	pop(Q.heightBracket, 0.9, 700)
	crash(T.G3, 0.5)
	riser(Q.goalLine[0], Q.goalLine[1], 0.5)
	bell(Q.goalLine[1], 91, 1)
	bell(Q.goalLine[1], 84, 0.7)
	// Reality: a note a beat as today moves, then it lands.
	const beats = Math.round((Q.sweep[1] - Q.sweep[0]) / 0.4)
	for (let i = 0; i < beats; i++) marimba(Q.sweep[0] + i * 0.4, PENTA[i], 0.9 + i * 0.05, 0.3 + i * 0.05)
	riser(Q.sweep[0] + 1.2, Q.sweep[1])
	crash(Q.sweep[1], 0.9)
	bell(Q.sweep[1], 84, 0.8)
	// The chips: three notes down, where it slips.
	for (const [t, m, i] of run(Q.chips.at, Q.chips.step, 3, 9, -1)) {
		pop(t, 1, 560 - i * 60)
		bell(t, m, 0.8)
	}
	// The band stops for "One more thing."
	roll(T.H - 0.8, T.H)
	kick(T.H, 0.9)
	chord(Q.oneMore, [57, 64, 69, 72, 76], 0.8, 0.8)
	riser(T.I - 1.2, T.I, 0.6)
	// I: the projection draws into the gap.
	crash(T.I, 0.6)
	riser(Q.projection[0], Q.gap)
	roll(Q.gap - 0.8, Q.gap)
	crash(Q.gap, 1)
	boom(Q.gap, 0.7)
	bell(Q.gap, 81, 1)
	// J: the number. Everything drops, then builds into the end card.
	boom(T.J, 1)
	crash(T.J, 0.8)
	chord(T.J + 0.8, [55, 60, 62, 67], 0.9, 0.7)
	chord(T.J + 2.4, [55, 59, 62, 67], 0.9, 0.7)
	riser(T.K - 1.6, T.K)
	roll(T.K - 0.8, T.K)
	// K: home.
	crash(T.K, 1)
	bell(T.K, 84, 1)
	const end = Q.lastChord
	kick(end)
	crash(end, 0.9)
	chord(end, [48, 60, 64, 67, 72, 76], 1.2, 0.7)
	bell(end, 84, 1)
	bell(end + 0.2, 88, 0.7)
	bell(end + 0.4, 91, 0.6)
	bassNote(end, 36, 2.2, 1)
	padChord(end, 2.6, [48, 60, 64, 67], 1)

	/* ---------- mix ---------- */

	/** A small room: parallel damped combs into two all-passes. */
	const reverb = (x, off) => {
		const out = new Float32Array(N)
		for (const d of [1687, 1601, 1777, 1493, 2053, 1867]) {
			const buf = new Float32Array(d + off)
			let lp = 0
			let p = 0
			for (let i = 0; i < N; i++) {
				const y = buf[p]
				lp = y * 0.7 + lp * 0.3
				buf[p] = x[i] + lp * 0.8
				out[i] += y
				if (++p >= buf.length) p = 0
			}
		}
		for (const d of [605, 480]) {
			const buf = new Float32Array(d + off)
			let p = 0
			for (let i = 0; i < N; i++) {
				const y = buf[p]
				const v = out[i]
				buf[p] = v + y * 0.5
				out[i] = y - v * 0.5
				if (++p >= buf.length) p = 0
			}
		}
		return out
	}
	const wet = [reverb(send[0], 0), reverb(send[1], 25)]
	// The kick ducks the bass and the pad, for the pumping feel.
	const duck = new Float32Array(N).fill(1)
	for (const [tk, vel] of kicks) {
		const i0 = Math.round(tk * SR)
		for (let i = 0; i < 0.4 * SR && i0 + i < N; i++) {
			const t = i / SR
			duck[i0 + i] = Math.min(duck[i0 + i], 1 - 0.55 * vel * (1 - Math.exp(-t / 0.003)) * Math.exp(-t / 0.12))
		}
	}
	const out = stereo()
	let peak = 0
	for (let ch = 0; ch < 2; ch++)
		for (let i = 0; i < N; i++) {
			const v = Math.tanh(drums[ch][i] + (bass[i] * 1.1 + pad[ch][i] * 2.5) * duck[i] + music[ch][i] * 1.5 * (0.7 + 0.3 * duck[i]) + wet[ch][i] * 0.2)
			out[ch][i] = v
			peak = Math.max(peak, Math.abs(v))
		}
	const gain = 0.8 / peak
	const fadeOut = 2 * SR
	const pcm = Buffer.alloc(44 + N * 4)
	pcm.write("RIFF", 0)
	pcm.writeUInt32LE(36 + N * 4, 4)
	pcm.write("WAVEfmt ", 8)
	pcm.writeUInt32LE(16, 16)
	pcm.writeUInt16LE(1, 20)
	pcm.writeUInt16LE(2, 22)
	pcm.writeUInt32LE(SR, 24)
	pcm.writeUInt32LE(SR * 4, 28)
	pcm.writeUInt16LE(4, 32)
	pcm.writeUInt16LE(16, 34)
	pcm.write("data", 36)
	pcm.writeUInt32LE(N * 4, 40)
	for (let i = 0; i < N; i++) {
		const fade = Math.min(1, (N - i) / fadeOut) ** 2
		pcm.writeInt16LE(Math.round(out[0][i] * gain * fade * 32767), 44 + i * 4)
		pcm.writeInt16LE(Math.round(out[1][i] * gain * fade * 32767), 46 + i * 4)
	}
	writeFileSync(file, pcm)
	if (process.env.SCORE_DEBUG) {
		const rms = (x, a, z) => {
			let s = 0
			for (let i = Math.round(a * SR); i < Math.round(z * SR); i++) s += x[i] * x[i]
			return (10 * Math.log10(s / ((z - a) * SR) + 1e-12)).toFixed(1)
		}
		const pk = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0).toFixed(2)
		console.log(`peaks  drums ${pk(drums[0])}  bass ${pk(bass)}  music ${pk(music[0])}  pad ${pk(pad[0])}  wet ${pk(wet[0])}  → master ${peak.toFixed(2)}`)
		console.log(`chorus rms (26–36 s)  drums ${rms(drums[0], 26, 36)}  bass ${rms(bass, 26, 36)}  music ${rms(music[0], 26, 36)}  pad ${rms(pad[0], 26, 36)}  wet ${rms(wet[0], 26, 36)} dB`)
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const out = process.argv[2] ?? "impactt-score.wav"
	writeScore(out)
	console.log("score → " + out)
}
