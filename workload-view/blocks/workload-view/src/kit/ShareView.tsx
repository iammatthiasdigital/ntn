/**
 * The share popover: copy this view as a code, or paste someone's code to
 * get their filters and settings. Everything stays in the page — the code
 * travels however people choose to send it. Depends only on ./filters and
 * ./share, so blocks outside the kit can use it too.
 */
import { useMemo, useRef, useState } from "react"
import type { FilterState } from "./filters/core"
import { Close } from "./filters/icons"
import { Popover } from "./filters/popover"
import { decodeView, describe, encodeView, MAX_CODE, type Schemas } from "./share"

export const ShareIcon = () => (
	<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ico">
		<path d="M8 2.5v7.5M5 5.2 8 2.3l3 2.9" />
		<path d="M5.5 7.5H4a1.5 1.5 0 0 0-1.5 1.5v3A1.5 1.5 0 0 0 4 13.5h8a1.5 1.5 0 0 0 1.5-1.5V9A1.5 1.5 0 0 0 12 7.5h-1.5" />
	</svg>
)
const Sep = () => <div className="msep" />

export type ShareConfig<T> = {
	/** Block kind in the code, e.g. "orgchart"; codes only load into the same kind. */
	block: string
	defaults: T
	/** Property schemas the view's ids refer to (all bound sources). */
	schemas: Schemas
	/** Local-only content the code can carry along (e.g. whiteboard drawings). */
	extra?: { label: string; get: () => unknown; set: (v: unknown) => void }
	/** Clamps imported values to what the settings allow (sizes, enums). */
	sanitize?: (v: T) => T
}

type Props<T> = ShareConfig<T> & {
	anchor: HTMLElement | null
	onClose: () => void
	view: T
	setView: (f: (v: T) => T) => void
}

function copyText(text: string, fallback: HTMLTextAreaElement | null): Promise<boolean> {
	const legacy = () => {
		if (!fallback) return false
		fallback.focus()
		fallback.select()
		try {
			return document.execCommand("copy")
		} catch {
			return false
		}
	}
	if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, legacy)
	return Promise.resolve(legacy())
}

export function ShareView<T extends { filters: FilterState }>({ anchor, onClose, view, setView, block, defaults, schemas, extra, sanitize }: Props<T>) {
	const [withExtra, setWithExtra] = useState(true)
	const code = useMemo(() => encodeView(block, view, schemas, extra && withExtra ? extra.get() : undefined), [block, view, schemas, extra, withExtra])
	const out = useRef<HTMLTextAreaElement>(null)
	const [copied, setCopied] = useState<"yes" | "no" | null>(null)
	const [paste, setPaste] = useState("")
	const [applied, setApplied] = useState(false)
	const [resetArmed, setResetArmed] = useState(false)
	const decoded = useMemo(() => (paste.trim() ? decodeView(paste, block, defaults, schemas) : null), [paste, block, defaults, schemas])

	const copy = () => {
		void copyText(code, out.current).then((ok) => {
			setCopied(ok ? "yes" : "no")
			window.setTimeout(() => setCopied(null), 2400)
		})
	}
	const loadFile = (f: File | undefined) => {
		if (!f) return
		if (f.size > MAX_CODE) {
			setPaste("")
			return
		}
		void f.text().then(setPaste)
	}
	const apply = () => {
		if (!decoded?.ok) return
		const next = { ...decoded.view, filterBar: true }
		setView(() => (sanitize ? sanitize(next) : next))
		if (extra && decoded.extra !== undefined) extra.set(decoded.extra)
		setApplied(true)
		setPaste("")
		window.setTimeout(onClose, 900)
	}

	return (
		<Popover anchor={anchor} onClose={onClose} width={340} className="settings share">
			<div className="shead">
				<span className="shead-t">Share view</span>
				<button type="button" className="ghost ic" aria-label="Close" onClick={onClose}>
					<Close />
				</button>
			</div>
			<div className="sh">
				<p className="sh-t">Send this code to others. Pasting it into this block gives them the same filters and settings.</p>
				<textarea ref={out} className="sh-code" readOnly rows={3} value={code} spellCheck={false} aria-label="View code" onFocus={(e) => e.currentTarget.select()} />
				{extra ? (
					<label className="sh-opt">
						<input type="checkbox" checked={withExtra} onChange={(e) => setWithExtra(e.target.checked)} />
						{extra.label}
					</label>
				) : null}
				<div className="sh-row">
					<span className="sh-hint">{copied === "yes" ? "Copied to the clipboard." : copied === "no" ? "Select the code and copy it (⌘C)." : `${describe(view, defaults as object)}`}</span>
					<button type="button" className="sh-btn primary" onClick={copy}>
						{copied === "yes" ? "Copied ✓" : "Copy code"}
					</button>
				</div>
			</div>
			<Sep />
			<div className="sh">
				<p className="sh-t">
					<b>Use a view</b> — paste a code to replace your current view.
				</p>
				<textarea className="sh-code" rows={3} value={paste} placeholder="ntnview:…" spellCheck={false} aria-label="Paste a view code" maxLength={MAX_CODE} onChange={(e) => setPaste(e.target.value)} />
				<div className="sh-row">
					<span className={"sh-hint" + (decoded && !decoded.ok ? " bad" : "")}>
						{applied
							? "View applied ✓"
							: !decoded
								? (
									<label className="sh-file">
										or load a file…
										<input type="file" accept=".txt,.json,text/plain,application/json" onChange={(e) => loadFile(e.target.files?.[0])} />
									</label>
								)
								: decoded.ok
									? [
											describe(decoded.view, defaults as object),
											decoded.renamed ? `${decoded.renamed} propert${decoded.renamed > 1 ? "ies" : "y"} matched by name` : "",
											decoded.missing.length ? `not here: ${decoded.missing.slice(0, 3).join(", ")}${decoded.missing.length > 3 ? "…" : ""}` : "",
										]
											.filter(Boolean)
											.join(" · ")
									: decoded.error}
					</span>
					<button type="button" className="sh-btn primary" disabled={!decoded?.ok} onClick={apply}>
						Apply
					</button>
				</div>
			</div>
			<Sep />
			<div className="sh sh-foot">
				<button
					type="button"
					className={"sh-btn" + (resetArmed ? " warn" : "")}
					onClick={() => {
						if (!resetArmed) {
							setResetArmed(true)
							window.setTimeout(() => setResetArmed(false), 3000)
							return
						}
						setView(() => defaults)
						setResetArmed(false)
						onClose()
					}}
				>
					{resetArmed ? "Click again to reset" : "Reset to the default view"}
				</button>
			</div>
		</Popover>
	)
}
