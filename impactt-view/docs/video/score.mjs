/**
 * The film's score, synthesised: the opening of Bach's Prelude in C major
 * (BWV 846, public domain) on a soft piano-like voice, one bar per 3.2 s so
 * the film's scenes change on its beats. Writes a 48 kHz stereo WAV.
 *
 *   node docs/video/score.mjs out.wav
 */
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const SR = 48000
const BAR = 3.2
const STEP = BAR / 16

/** Bars 1–19: five notes each, played 1 2 3 4 5 3 4 5, twice. */
const BARS = [
	"C4 E4 G4 C5 E5",
	"C4 D4 A4 D5 F5",
	"B3 D4 G4 D5 F5",
	"C4 E4 G4 C5 E5",
	"C4 E4 A4 E5 A5",
	"C4 D4 F#4 A4 D5",
	"B3 D4 G4 D5 G5",
	"B3 C4 E4 G4 C5",
	"A3 C4 E4 G4 C5",
	"D3 A3 D4 F#4 C5",
	"G3 B3 D4 G4 B4",
	"G3 Bb3 E4 G4 C#5",
	"F3 A3 D4 A4 D5",
	"F3 Ab3 D4 F4 B4",
	"E3 G3 C4 G4 C5",
	"E3 F3 A3 C4 F4",
	"D3 F3 A3 C4 F4",
	"G2 D3 G3 B3 F4",
	"C3 E3 G3 C4 E4",
]
/** The closing chord, rolled, under the end card. */
const FINAL = "C2 G2 C3 E3 G3 C4 E4 G4"

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const midi = (n) => {
	const m = n.match(/^([A-G])([#b]?)(\d)$/)
	return 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0)
}

export function writeScore(file, seconds = 68) {
	const N = Math.round(seconds * SR)
	const L = new Float32Array(N)
	const R = new Float32Array(N)
	let seed = 7
	const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1

	/** One struck string: a few partials, the higher ones softer and shorter. */
	function note(t0, m, vel, ring = 1) {
		const f = 440 * 2 ** ((m - 69) / 12)
		const tau = Math.min(3.6, Math.max(0.55, 1.9 * (220 / f) ** 0.55)) * ring
		const pan = 0.5 + Math.max(-0.3, Math.min(0.3, (m - 60) / 60))
		const gl = Math.cos((pan * Math.PI) / 2)
		const gr = Math.sin((pan * Math.PI) / 2)
		const i0 = Math.round(t0 * SR)
		const len = Math.min(N - i0, Math.round(tau * 5.5 * SR))
		const parts = [1, 0.4, 0.2, 0.09, 0.04, 0.02].map((a, k) => {
			const n = k + 1
			const fk = f * n * Math.sqrt(1 + 0.00022 * n * n)
			// Softer notes are duller, as on a piano.
			if (fk > 9000) return null
			const d = (1 + 0.85 * k) / (tau * SR)
			// Two decays per partial: a quick one for the strike, a slow one for the ring.
			return { w: (2 * Math.PI * fk) / SR, ph: rnd() * 0.3, slow: 0.62 * a * (k ? 0.45 + 0.55 * vel : 1), fast: 0.38 * a * (k ? 0.45 + 0.55 * vel : 1), ks: Math.exp(-d), kf: Math.exp(-d * 5) }
		}).filter(Boolean)
		const ka = Math.exp(-1 / (0.0045 * SR))
		let rise = 1
		for (let i = 0; i < len; i++) {
			let v = 0
			for (const p of parts) {
				v += Math.sin(p.w * i + p.ph) * (p.slow + p.fast)
				p.slow *= p.ks
				p.fast *= p.kf
			}
			rise *= ka
			v *= (1 - rise) * vel * 0.2
			L[i0 + i] += v * gl
			R[i0 + i] += v * gr
		}
	}

	BARS.forEach((bar, b) => {
		const ns = bar.split(" ").map(midi)
		// A slow swell over each four-bar phrase, and a lift towards the end.
		const phrase = 0.86 + 0.14 * Math.sin(((b % 4) / 4) * Math.PI) + (b >= 12 ? 0.05 : 0)
		for (let half = 0; half < 2; half++) {
			;[0, 1, 2, 3, 4, 2, 3, 4].forEach((k, j) => {
				const t = b * BAR + (half * 8 + j) * STEP + rnd() * 0.004
				const vel = (k === 0 ? 0.92 : k === 1 ? 0.74 : k === 4 ? 0.7 : 0.6) * phrase * (1 + rnd() * 0.05)
				note(Math.max(0, t), ns[k], vel, k < 2 ? 1.25 : 1)
			})
		}
	})
	FINAL.split(" ").map(midi).forEach((m, i) => note(BARS.length * BAR + i * 0.055, m, 0.8 - i * 0.03, 1.7))

	/* A small hall: parallel damped combs into two all-passes. */
	const reverb = (x, off) => {
		const out = new Float32Array(N)
		for (const d of [1687, 1601, 1777, 1493, 2053, 1867]) {
			const buf = new Float32Array(d + off)
			let lp = 0
			let p = 0
			for (let i = 0; i < N; i++) {
				const y = buf[p]
				lp = y * 0.72 + lp * 0.28
				buf[p] = x[i] + lp * 0.86
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
	const wl = reverb(L, 0)
	const wr = reverb(R, 25)

	let peak = 0
	for (let i = 0; i < N; i++) {
		L[i] += wl[i] * 0.05
		R[i] += wr[i] * 0.05
		peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
	}
	const gain = 0.56 / peak
	const fadeOut = 3.2 * SR
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
		pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain * fade)) * 32767), 44 + i * 4)
		pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain * fade)) * 32767), 46 + i * 4)
	}
	writeFileSync(file, pcm)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const out = process.argv[2] ?? "impactt-score.wav"
	writeScore(out)
	console.log("score → " + out)
}
