/**
 * Renders film.html to an MP4: steps the film frame by frame in headless
 * Chrome over the DevTools protocol and pipes the screenshots to ffmpeg,
 * together with the score from score.mjs. No npm dependencies; needs ffmpeg
 * and a Chrome or Chromium (set CHROME to its binary if it isn't found).
 *
 *   node docs/video/render.mjs                     → docs/video/impactt-explainer.mp4
 *   node docs/video/render.mjs --mute              no soundtrack
 *   node docs/video/render.mjs --gif               also cut the README GIF, impactt-explainer.gif
 *   node docs/video/render.mjs --fps 30 --out x.mp4
 *   node docs/video/render.mjs --stills 2,8.5,40 --dir /tmp/stills   PNGs at those seconds
 */
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { writeScore } from "./score.mjs"
import "./cues.js"

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (name, fallback) => {
	const i = args.indexOf("--" + name)
	return i < 0 ? fallback : (args[i + 1] ?? true)
}
const W = 1920
const H = 1080
const workers = Number(opt("workers", 4))
const stills = opt("stills", null)

function findChrome() {
	if (process.env.CHROME) return process.env.CHROME
	const found = []
	const cache = join(homedir(), "Library/Caches/ms-playwright")
	if (existsSync(cache))
		for (const d of readdirSync(cache).sort().reverse()) {
			if (d.startsWith("chromium_headless_shell-")) found.push(join(cache, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell"), join(cache, d, "chrome-headless-shell-mac-x64/chrome-headless-shell"))
		}
	found.push(
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium"
	)
	const hit = found.find(existsSync)
	if (!hit) throw new Error("No Chrome found. Set CHROME=/path/to/chrome.")
	return hit
}

/** Starts headless Chrome and returns a DevTools connection to it. */
async function launch() {
	const profile = mkdtempSync(join(tmpdir(), "impactt-film-"))
	const proc = spawn(findChrome(), ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--hide-scrollbars", "--force-device-scale-factor=1", "--force-color-profile=srgb", "--disable-gpu-vsync", "--no-first-run", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
	const url = await new Promise((ok, fail) => {
		let err = ""
		proc.stderr.on("data", (d) => {
			err += d
			const m = err.match(/DevTools listening on (ws:\/\/\S+)/)
			if (m) ok(m[1])
		})
		proc.on("exit", () => fail(new Error("Chrome exited:\n" + err)))
	})
	const ws = new WebSocket(url)
	await new Promise((ok, fail) => {
		ws.onopen = ok
		ws.onerror = fail
	})
	let id = 0
	const waiting = new Map()
	ws.onmessage = (e) => {
		const m = JSON.parse(e.data)
		const w = waiting.get(m.id)
		if (!w) return
		waiting.delete(m.id)
		if (m.error) w.fail(new Error(m.error.message))
		else w.ok(m.result)
	}
	const send = (method, params = {}, sessionId) =>
		new Promise((ok, fail) => {
			waiting.set(++id, { ok, fail })
			ws.send(JSON.stringify({ id, method, params, sessionId }))
		})
	const close = async () => {
		ws.close()
		const gone = new Promise((r) => proc.once("exit", r))
		proc.kill()
		await gone
		rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
	}
	return { send, close }
}

/** Opens the film in a tab and returns a function that draws and captures second t. */
async function openFilm({ send }) {
	const { targetId } = await send("Target.createTarget", { url: "about:blank" })
	const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
	const cmd = (method, params) => send(method, params, sessionId)
	await cmd("Page.enable")
	await cmd("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false })
	await cmd("Page.navigate", { url: pathToFileURL(join(here, "film.html")).href + "?render" })
	for (let i = 0; ; i++) {
		const r = await cmd("Runtime.evaluate", { expression: "window.FILM ? JSON.stringify({duration: FILM.duration, fps: FILM.fps}) : ''" })
		if (r.result.value) {
			const info = JSON.parse(r.result.value)
			const shot = async (t, scale = 1) => {
				const e = await cmd("Runtime.evaluate", { expression: `FILM.seek(${t})` })
				if (e.exceptionDetails) throw new Error(`seek(${t}): ${e.exceptionDetails.exception?.description ?? e.exceptionDetails.text}`)
				const { data } = await cmd("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: H, scale } })
				return Buffer.from(data, "base64")
			}
			return { info, shot }
		}
		if (i > 100) throw new Error("film.html did not load (is data.js there? npx tsx docs/video/data.ts)")
		await new Promise((r) => setTimeout(r, 100))
	}
}

/** Cuts the stretches named in cues.js into a looping GIF for the README. */
function writeGif(mp4, gif) {
	const cuts = globalThis.IMPACTT_CUES.gif
	const graph =
		cuts.map(([a, z], i) => `[0:v]trim=${a}:${z},setpts=PTS-STARTPTS[c${i}]`).join(";") +
		`;${cuts.map((_, i) => `[c${i}]`).join("")}concat=n=${cuts.length}:v=1,fps=12.5,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`
	const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-filter_complex", graph, "-loop", "0", gif], { stdio: "inherit" })
	if (r.status) throw new Error("ffmpeg (gif) exited with " + r.status)
	console.log(`gif → ${gif}`)
}

const chrome = await launch()
try {
	if (stills) {
		const dir = resolve(String(opt("dir", join(here, "stills"))))
		mkdirSync(dir, { recursive: true })
		const { shot } = await openFilm(chrome)
		for (const t of String(stills).split(",").map(Number)) {
			writeFileSync(join(dir, `t${t.toFixed(2).padStart(6, "0")}.png`), await shot(t, Number(opt("scale", 1))))
		}
		console.log(`stills → ${dir}`)
	} else {
		const films = await Promise.all(Array.from({ length: workers }, () => openFilm(chrome)))
		const { duration } = films[0].info
		const fps = Number(opt("fps", films[0].info.fps))
		const from = Number(opt("from", 0))
		const to = Number(opt("to", duration))
		const out = resolve(String(opt("out", join(here, "impactt-explainer.mp4"))))
		const mute = args.includes("--mute") || from > 0 || to < duration
		const score = join(tmpdir(), `impactt-score-${process.pid}.wav`)
		if (!mute) writeScore(score, duration)
		const ff = spawn(
			"ffmpeg",
			[
				"-y", "-loglevel", "error",
				"-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
				...(mute ? [] : ["-i", score]),
				"-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
				"-c:v", "libx264", "-preset", "slow", "-crf", "15", "-tune", "animation",
				"-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
				...(mute ? [] : ["-c:a", "aac", "-b:a", "256k", "-shortest"]),
				"-movflags", "+faststart",
				out,
			],
			{ stdio: ["pipe", "inherit", "inherit"] }
		)
		const done = new Promise((ok, fail) => ff.on("exit", (c) => (c ? fail(new Error("ffmpeg exited with " + c)) : ok())))
		const n0 = Math.round(from * fps)
		const n1 = Math.round(to * fps)
		const t0 = Date.now()
		for (let n = n0; n < n1; n += workers) {
			const batch = await Promise.all(films.map((f, j) => (n + j < n1 ? f.shot((n + j) / fps) : null)))
			for (const png of batch) if (png && !ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r))
			if ((n - n0) % (workers * 60) === 0) process.stdout.write(`\r${n - n0}/${n1 - n0} frames · ${(((n - n0) / (Date.now() - t0)) * 1000).toFixed(1)} fps `)
		}
		ff.stdin.end()
		await done
		if (!mute) rmSync(score, { force: true })
		console.log(`\r${n1 - n0} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}`)
		if (args.includes("--gif")) writeGif(out, out.replace(/\.mp4$/, "") + ".gif")
	}
} finally {
	await chrome.close()
}
