/**
 * Minimal Notion-like popover system. Popovers are `position: fixed` next to
 * their anchor (the block's iframe grows with its content, so the viewport is
 * the whole block) and stack: a click outside closes every popover above the
 * one it landed in, Escape closes the top one.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Check, Chevron } from "./icons"

type Entry = { el: HTMLElement | null; anchor: HTMLElement | null; close: () => void }
const STACK: Entry[] = []
let installed = false

function install(): void {
	if (installed) return
	installed = true
	document.addEventListener(
		"mousedown",
		(e) => {
			const t = e.target as Node
			for (let i = STACK.length - 1; i >= 0; i--) {
				const en = STACK[i]
				if (en.el?.contains(t) || en.anchor?.contains(t)) break
				en.close()
			}
		},
		true
	)
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && STACK.length) {
			e.stopPropagation()
			STACK[STACK.length - 1].close()
		}
	})
}

export type PopoverProps = {
	anchor: HTMLElement | null
	onClose: () => void
	children: ReactNode
	width?: number | string
	/** "below" (default) or "right" of the anchor (submenus). */
	side?: "below" | "right"
	className?: string
}

export function Popover({ anchor, onClose, children, width, side = "below", className }: PopoverProps) {
	const ref = useRef<HTMLDivElement>(null)
	const closeRef = useRef(onClose)
	closeRef.current = onClose
	const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

	useEffect(() => {
		install()
		const entry: Entry = { el: null, anchor, close: () => closeRef.current() }
		entry.el = ref.current
		STACK.push(entry)
		return () => {
			const i = STACK.indexOf(entry)
			if (i >= 0) STACK.splice(i, 1)
		}
	}, [anchor])

	useLayoutEffect(() => {
		const el = ref.current
		if (!el || !anchor) return
		const place = () => {
			const r = anchor.getBoundingClientRect()
			const w = el.offsetWidth
			const h = el.offsetHeight
			const vw = document.documentElement.clientWidth
			const vh = Math.max(window.innerHeight, document.documentElement.clientHeight)
			let left: number
			let top: number
			if (side === "right") {
				left = r.right + 4
				if (left + w > vw - 8) left = Math.max(8, r.left - 4 - w)
				top = r.top - 6
			} else {
				left = r.left
				top = r.bottom + 4
			}
			if (left + w > vw - 8) left = Math.max(8, vw - 8 - w)
			if (top + h > vh - 8) top = r.top - 4 - h >= 8 ? r.top - 4 - h : Math.max(8, vh - 8 - h)
			setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }))
		}
		place()
		const ro = new ResizeObserver(place)
		ro.observe(el)
		window.addEventListener("resize", place)
		window.addEventListener("scroll", place, true)
		return () => {
			ro.disconnect()
			window.removeEventListener("resize", place)
			window.removeEventListener("scroll", place, true)
		}
	}, [anchor, side])

	return (
		<div
			ref={ref}
			className={"pop" + (className ? " " + className : "")}
			role="dialog"
			style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width }}
			onMouseDown={(e) => e.stopPropagation()}
		>
			{children}
		</div>
	)
}

/** Anchor state for a popover: ref-callback element + open flag. */
export function useAnchor<T extends HTMLElement = HTMLButtonElement>() {
	const [el, setEl] = useState<T | null>(null)
	const [open, setOpen] = useState(false)
	return { el, ref: setEl, open, setOpen, toggle: () => setOpen((o) => !o), close: () => setOpen(false) }
}

export function MenuItem({
	icon,
	children,
	onClick,
	selected,
	right,
	danger,
	active,
}: {
	icon?: ReactNode
	children: ReactNode
	onClick?: () => void
	selected?: boolean
	right?: ReactNode
	danger?: boolean
	active?: boolean
}) {
	return (
		<button type="button" className={"mi" + (danger ? " danger" : "") + (active ? " kbd" : "")} onClick={onClick} role="menuitem">
			{icon ? <span className="mi-ic">{icon}</span> : null}
			<span className="mi-l">{children}</span>
			{right}
			{selected ? (
				<span className="mi-check">
					<Check />
				</span>
			) : null}
		</button>
	)
}

export function MenuSep() {
	return <div className="msep" role="separator" />
}

export type SelectOption<V extends string> = { value: V; label: string; icon?: ReactNode }

/** Notion's inline dropdown: a quiet button that opens a check-marked menu. */
export function Select<V extends string>({
	value,
	options,
	onChange,
	className,
	ariaLabel,
	width = 200,
	disabled,
}: {
	value: V
	options: SelectOption<V>[]
	onChange: (v: V) => void
	className?: string
	ariaLabel?: string
	width?: number
	disabled?: boolean
}) {
	const a = useAnchor()
	const cur = options.find((o) => o.value === value)
	return (
		<>
			<button type="button" ref={a.ref} className={"sel" + (className ? " " + className : "")} onClick={a.toggle} aria-label={ariaLabel} aria-haspopup="menu" disabled={disabled}>
				{cur?.icon}
				<span>{cur?.label ?? "…"}</span>
				<Chevron />
			</button>
			{a.open ? (
				<Popover anchor={a.el} onClose={a.close} width={width}>
					<div className="menu" role="menu">
						{options.map((o) => (
							<MenuItem
								key={o.value}
								icon={o.icon}
								selected={o.value === value}
								onClick={() => {
									onChange(o.value)
									a.close()
								}}
							>
								{o.label}
							</MenuItem>
						))}
					</div>
				</Popover>
			) : null}
		</>
	)
}
