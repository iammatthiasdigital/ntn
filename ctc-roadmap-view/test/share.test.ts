import { test } from "node:test"
import assert from "node:assert/strict"
import { decodeView, encodeView } from "../blocks/ctc-roadmap-view/src/kit/share.ts"
import { DEFAULT_VIEW, sanitize } from "../blocks/ctc-roadmap-view/src/settings.ts"

test("the roadmap view round-trips through a view code", () => {
	const view = { ...DEFAULT_VIEW, view: "coverage" as const, tagTerms: ["mandate", "vat"], done: "#00aa00" }
	const d = decodeView(encodeView("ctc-roadmap", view, {}), "ctc-roadmap", DEFAULT_VIEW, {})
	assert.ok(d.ok)
	assert.deepEqual(d.view, view)
	assert.equal(decodeView(encodeView("ctc-roadmap", view, {}), "whiteboard", DEFAULT_VIEW, {}).ok, false)
})

test("imported views go through the block's sanitizer", () => {
	const b64 = Buffer.from('{"b":"ctc-roadmap","v":1,"props":{},"view":{"view":"<img>","tagTerms":["ok"],"exportSlide":"yes","done":"red"}}').toString("base64url")
	const d = decodeView(`ntnview:ctc-roadmap:${b64}`, "ctc-roadmap", DEFAULT_VIEW, {})
	assert.ok(d.ok)
	const s = sanitize(d.view)
	assert.equal(s.view, "kanban")
	assert.equal(s.exportSlide, true)
	assert.equal(s.done, DEFAULT_VIEW.done)
	assert.deepEqual(s.tagTerms, ["ok"])
})
