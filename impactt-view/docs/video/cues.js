/**
 * The film's cue sheet, in seconds: when scenes start and when things land.
 * film.html animates to it and score.mjs plays to it, so the music hits the
 * animation. Everything sits on the score's grid (150 bpm: a beat is 0.4 s,
 * an eighth 0.2 s, a bar 1.6 s).
 */
globalThis.IMPACTT_CUES = {
	duration: 68,
	scene: { A: 0, B: 3.2, C: 6.4, D: 11.2, E: 16, F: 19.2, G: 25.6, G2: 28.8, G3: 32, G4: 36.8, G5: 43.2, H: 48, I: 51.2, J: 56.8, K: 60.8 },
	/** A · the goal pill pops, its number counts up. */
	goalPill: 1,
	goalCount: [1.2, 2.2],
	/** B · the six initiative pills, one after another. */
	pills: { at: 4, step: 0.1 },
	/** C · the roadmap rows draw in. */
	rows: { at: 6.8, step: 0.2 },
	/** D · the KPI card pops, its number counts up. */
	kpiCard: 11.6,
	kpiCount: [12, 13.2],
	/** F · Gantt, Marimekko, Burn-up appear, merge, and the title lands. */
	cards: { at: 19.6, step: 0.4 },
	merge: [21.6, 22.4],
	title: 22.4,
	/** G · brackets, the rows morphing into the stack, the goal line reaching its flag. */
	widthBracket: 26.4,
	morph: [29, 30.6],
	heightBracket: 30.6,
	goalLine: [33.2, 34.4],
	/** Today sweeps from the start of the plan to today. */
	sweep: [37.2, 40.8],
	/** The "delivered so far" chips. */
	chips: { at: 44.4, step: 0.4 },
	/** H · "One more thing." */
	oneMore: 48.2,
	/** I · the projection line draws, then the gap to the goal appears. */
	projection: [52.8, 54.6],
	gap: 54.8,
	/** K · the last chord, after which the score rings out. */
	lastChord: 64,
	/** The stretches the README GIF is cut from. */
	gif: [
		[25.6, 47.85],
		[51.2, 56.65],
	],
}
