/**
 * Notion-style view-settings building blocks: a popover with rows that
 * drill into sub-pages (back arrow in the header), switches and pick rows.
 */
import type { ReactNode } from "react"
import { ArrowRight, Check, Close } from "./filters/icons"
import { Popover } from "./filters/popover"

export const I = ({ children }: { children: ReactNode }) => (
	<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ico">
		{children}
	</svg>
)

/** Notion's view-settings glyph: horizontal sliders. */
export const SlidersIcon = () => (
	<I>
		<path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" />
		<circle cx="10" cy="4.5" r="1.5" />
		<circle cx="6" cy="11.5" r="1.5" />
	</I>
)
export const BackIcon = () => (
	<I>
		<path d="M9.5 3.5 5 8l4.5 4.5" />
	</I>
)
export const ColumnIcon = () => (
	<I>
		<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
		<path d="M6.5 2.5v11" />
	</I>
)
export const ClockIcon = () => (
	<I>
		<circle cx="8" cy="8" r="5.5" />
		<path d="M8 5v3.2l2.2 1.3" />
	</I>
)
export const TargetIcon = () => (
	<I>
		<circle cx="8" cy="8" r="5.5" />
		<circle cx="8" cy="8" r="2.5" />
	</I>
)
export const TableIcon = () => (
	<I>
		<rect x="2.5" y="3" width="11" height="10" rx="1.5" />
		<path d="M2.5 6.5h11M2.5 9.8h11M6.5 6.5V13" />
	</I>
)
export const LineIcon = () => (
	<I>
		<path d="M2.5 12.5 6 8.5l2.5 2 5-6" />
		<path d="M2.5 2.5v11h11" opacity=".5" />
	</I>
)
export const LayersIcon = () => (
	<I>
		<path d="M8 2.5 13.5 5.5 8 8.5 2.5 5.5z" />
		<path d="m2.5 8.5 5.5 3 5.5-3" />
		<path d="m2.5 11 5.5 3 5.5-3" opacity=".5" />
	</I>
)
export const PersonIcon = () => (
	<I>
		<circle cx="8" cy="5.5" r="2.5" />
		<path d="M3 13.5c.6-2.5 2.6-4 5-4s4.4 1.5 5 4" />
	</I>
)
export const HashIcon = () => (
	<I>
		<path d="M6 2.5 5 13.5M11 2.5l-1 11M2.5 6h11M2 10h11" />
	</I>
)

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
	return (
		<button type="button" role="switch" aria-checked={on} aria-label={label} className={"switch" + (on ? " on" : "")} onClick={() => onChange(!on)}>
			<span />
		</button>
	)
}

export function NavRow({ icon, label, value, onClick }: { icon: ReactNode; label: string; value?: string; onClick: () => void }) {
	return (
		<button type="button" className="srow" onClick={onClick}>
			<span className="srow-ic">{icon}</span>
			<span className="srow-l">{label}</span>
			{value ? <span className="srow-v">{value}</span> : null}
			<span className="srow-go">
				<ArrowRight />
			</span>
		</button>
	)
}

export function ToggleRow({ icon, label, sub, on, onChange }: { icon?: ReactNode; label: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
	return (
		<div className="srow" onClick={() => onChange(!on)} role="presentation">
			{icon ? <span className="srow-ic">{icon}</span> : null}
			<span className="srow-l">
				{label}
				{sub ? <span className="srow-sub">{sub}</span> : null}
			</span>
			<span onClick={(e) => e.stopPropagation()} role="presentation">
				<Switch on={on} onChange={onChange} label={label} />
			</span>
		</div>
	)
}

export function PickRow({ icon, label, sub, value, selected, onClick, checkbox }: { icon?: ReactNode; label: string; sub?: string; value?: string; selected: boolean; onClick: () => void; checkbox?: boolean }) {
	return (
		<button type="button" className="srow" role={checkbox ? "menuitemcheckbox" : "menuitemradio"} aria-checked={selected} onClick={onClick}>
			{icon ? <span className="srow-ic">{icon}</span> : null}
			<span className="srow-l">
				{label}
				{sub ? <span className="srow-sub">{sub}</span> : null}
			</span>
			{value ? <span className="srow-v">{value}</span> : null}
			{selected ? (
				<span className="srow-check">
					<Check />
				</span>
			) : null}
		</button>
	)
}

export function NumberRow({ label, value, onChange, step = 1, min, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string }) {
	return (
		<label className="srow">
			<span className="srow-l">{label}</span>
			<input className="field num" type="number" step={step} min={min} value={value} style={{ width: 72 }} onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))} />
			{suffix ? <span className="srow-v">{suffix}</span> : null}
		</label>
	)
}

export function Header({ title, onBack, onClose }: { title: string; onBack?: () => void; onClose: () => void }) {
	return (
		<div className="shead">
			{onBack ? (
				<button type="button" className="ghost ic" aria-label="Back" onClick={onBack}>
					<BackIcon />
				</button>
			) : null}
			<span className="shead-t">{title}</span>
			<button type="button" className="ghost ic" aria-label="Close" onClick={onClose}>
				<Close />
			</button>
		</div>
	)
}

export const Sep = () => <div className="msep" />
export const Note = ({ children }: { children: ReactNode }) => <p className="snote">{children}</p>

/** The panel frame: a 300px popover with a header and a body of rows. */
export function SettingsShell({ anchor, onClose, title, onBack, children }: { anchor: HTMLElement | null; onClose: () => void; title: string; onBack?: () => void; children: ReactNode }) {
	return (
		<Popover anchor={anchor} onClose={onClose} width={300} className="settings">
			<Header title={title} onBack={onBack} onClose={onClose} />
			<div className="sbody" role="menu">
				{children}
			</div>
		</Popover>
	)
}
