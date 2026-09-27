/**
 * Notion's filter bar: one chip per simple filter (ANDed), an optional
 * advanced filter chip ("2 rules") with And/Or rules and groups, and
 * "+ Add filter". Properties come from the bound database, so every
 * property it has — of any type — can be filtered on.
 */
import { useEffect, useState } from "react"
import {
	chipLabel,
	countRules,
	isActive,
	newId,
	newRule,
	operatorLabel,
	operatorsFor,
	withOperator,
	type FilterProperty,
	type FilterState,
	type Group,
	type Rule,
} from "./core"
import { ValueEditor, PropertyMenu } from "./editors"
import { Chevron, Copy, Dots, FilterIcon, Group as GroupIcon, Plus, PropIcon, Trash } from "./icons"
import { MenuItem, MenuSep, Popover, Select, useAnchor } from "./popover"

type Props = {
	properties: FilterProperty[]
	state: FilterState
	onChange: (s: FilterState) => void
	today: string
	/** Rule id whose editor should open on mount (a just-added chip). */
	openRuleId: string | null
	onOpened: () => void
	openAdvanced: boolean
	onAdvancedOpened: () => void
}

export function FilterBar({ properties, state, onChange, today, openRuleId, onOpened, openAdvanced, onAdvancedOpened }: Props) {
	const byId = new Map(properties.map((p) => [p.id, p]))
	const add = useAnchor()
	const [pendingOpen, setPendingOpen] = useState<string | null>(null)
	const [advOpen, setAdvOpen] = useState(false)

	useEffect(() => {
		if (openRuleId) {
			setPendingOpen(openRuleId)
			onOpened()
		}
	}, [openRuleId, onOpened])
	useEffect(() => {
		if (openAdvanced) {
			setAdvOpen(true)
			onAdvancedOpened()
		}
	}, [openAdvanced, onAdvancedOpened])

	const setRule = (r: Rule) => onChange({ ...state, rules: state.rules.map((x) => (x.id === r.id ? r : x)) })
	const removeRule = (id: string) => onChange({ ...state, rules: state.rules.filter((x) => x.id !== id) })
	const toAdvanced = (r: Rule) => {
		const adv: Group = state.advanced ?? { kind: "group", id: newId(), conjunction: "and", children: [] }
		onChange({ rules: state.rules.filter((x) => x.id !== r.id), advanced: { ...adv, children: [...adv.children, r] } })
		setAdvOpen(true)
	}

	return (
		<div className="fbar" role="toolbar" aria-label="Filters">
			{state.advanced ? (
				<AdvancedChip
					group={state.advanced}
					properties={properties}
					byId={byId}
					today={today}
					open={advOpen}
					setOpen={setAdvOpen}
					onChange={(g) => onChange({ ...state, advanced: g })}
					onDelete={() => {
						onChange({ ...state, advanced: null })
						setAdvOpen(false)
					}}
				/>
			) : null}
			{state.rules.map((r) => {
				const p = byId.get(r.propertyId)
				if (!p) return null
				return (
					<RuleChip
						key={r.id}
						rule={r}
						p={p}
						today={today}
						autoOpen={pendingOpen === r.id}
						onAutoOpened={() => setPendingOpen(null)}
						onChange={setRule}
						onDelete={() => removeRule(r.id)}
						onToAdvanced={() => toAdvanced(r)}
					/>
				)
			})}
			<button type="button" ref={add.ref} className="addf" onClick={add.toggle} aria-haspopup="menu">
				<Plus size={14} />
				<span>Add filter</span>
			</button>
			{add.open ? (
				<Popover anchor={add.el} onClose={add.close} width={260}>
					<PropertyMenu
						properties={properties}
						onPick={(p) => {
							const r = newRule(p)
							onChange({ ...state, rules: [...state.rules, r] })
							setPendingOpen(r.id)
							add.close()
						}}
						footer={
							<>
								<MenuSep />
								<div className="menu">
									<MenuItem
										icon={<Plus />}
										onClick={() => {
											const first = properties[0]
											if (!first) return
											const adv: Group = state.advanced ?? { kind: "group", id: newId(), conjunction: "and", children: [newRule(first)] }
											onChange({ ...state, advanced: adv })
											setAdvOpen(true)
											add.close()
										}}
									>
										Add advanced filter
									</MenuItem>
								</div>
							</>
						}
					/>
				</Popover>
			) : null}
		</div>
	)
}

/* ---------- simple rule chip ---------- */

function RuleChip({
	rule,
	p,
	today,
	autoOpen,
	onAutoOpened,
	onChange,
	onDelete,
	onToAdvanced,
}: {
	rule: Rule
	p: FilterProperty
	today: string
	autoOpen: boolean
	onAutoOpened: () => void
	onChange: (r: Rule) => void
	onDelete: () => void
	onToAdvanced: () => void
}) {
	const a = useAnchor()
	const more = useAnchor()
	const { setOpen } = a
	useEffect(() => {
		if (autoOpen && a.el) {
			setOpen(true)
			onAutoOpened()
		}
	}, [autoOpen, a.el, setOpen, onAutoOpened])
	const active = isActive(rule, p)
	const label = chipLabel(rule, p)
	return (
		<>
			<button type="button" ref={a.ref} className={"chip-f" + (active ? " on" : "")} onClick={a.toggle} aria-haspopup="dialog" title={label.name + label.rest}>
				<PropIcon type={p.type} size={14} />
				<span className="chip-t">
					<span>{label.name}</span>
					{label.rest ? <b>{label.rest}</b> : null}
				</span>
				<Chevron />
			</button>
			{a.open ? (
				<Popover anchor={a.el} onClose={a.close} width={p.kind === "date" ? 280 : 290} className="ruleed">
					<div className="re-h">
						<span className="re-name">{p.name}</span>
						<Select
							value={rule.operator}
							options={operatorsFor(p).map((op) => ({ value: op, label: operatorLabel(op, p.kind) }))}
							onChange={(op) => onChange(withOperator(p, rule, op))}
							className="op"
							ariaLabel="Condition"
							width={200}
						/>
						<span className="spacer" />
						<button type="button" ref={more.ref} className="ghost ic" aria-label="More actions" onClick={more.toggle}>
							<Dots />
						</button>
						{more.open ? (
							<Popover anchor={more.el} onClose={more.close} width={220}>
								<div className="menu">
									<MenuItem
										icon={<Trash />}
										onClick={() => {
											more.close()
											a.close()
											onDelete()
										}}
									>
										Delete filter
									</MenuItem>
									<MenuItem
										icon={<FilterIcon />}
										onClick={() => {
											more.close()
											a.close()
											onToAdvanced()
										}}
									>
										Add to advanced filter
									</MenuItem>
								</div>
							</Popover>
						) : null}
					</div>
					<div className="re-b">
						<ValueEditor rule={rule} p={p} today={today} onChange={(value) => onChange({ ...rule, value })} />
					</div>
				</Popover>
			) : null}
		</>
	)
}

/* ---------- advanced filter ---------- */

function AdvancedChip({
	group,
	properties,
	byId,
	today,
	open,
	setOpen,
	onChange,
	onDelete,
}: {
	group: Group
	properties: FilterProperty[]
	byId: Map<string, FilterProperty>
	today: string
	open: boolean
	setOpen: (o: boolean) => void
	onChange: (g: Group) => void
	onDelete: () => void
}) {
	const a = useAnchor()
	const n = countRules(group)
	const active = countRules(group, byId, true) > 0
	return (
		<>
			<button type="button" ref={a.ref} className={"chip-f" + (active ? " on" : "")} onClick={() => setOpen(!open)} aria-haspopup="dialog">
				<FilterIcon size={14} />
				<span className="chip-t">
					<b>
						{n} rule{n === 1 ? "" : "s"}
					</b>
				</span>
				<Chevron />
			</button>
			{open && a.el ? (
				<Popover anchor={a.el} onClose={() => setOpen(false)} width="min(680px, calc(100vw - 16px))" className="advpop">
					<GroupBody group={group} depth={0} properties={properties} byId={byId} today={today} onChange={onChange} />
					<div className="adv-foot">
						<button type="button" className="ghost danger-t" onClick={onDelete}>
							<Trash />
							<span>Delete filter</span>
						</button>
					</div>
				</Popover>
			) : null}
		</>
	)
}

function GroupBody({
	group,
	depth,
	properties,
	byId,
	today,
	onChange,
}: {
	group: Group
	depth: number
	properties: FilterProperty[]
	byId: Map<string, FilterProperty>
	today: string
	onChange: (g: Group) => void
}) {
	const addMenu = useAnchor()
	const setChild = (i: number, c: Rule | Group | null) => {
		const children = [...group.children]
		if (c === null) children.splice(i, 1)
		else children[i] = c
		onChange({ ...group, children })
	}
	const insertAfter = (i: number, c: Rule | Group) => {
		const children = [...group.children]
		children.splice(i + 1, 0, c)
		onChange({ ...group, children })
	}
	const clone = (c: Rule | Group): Rule | Group => (c.kind === "rule" ? { ...c, id: newId() } : { ...c, id: newId(), children: c.children.map(clone) })
	const first = properties[0]

	return (
		<div className={"adv" + (depth ? " nested" : "")}>
			{group.children.length === 0 ? <div className="adv-empty">No filter rules applied to this group yet.</div> : null}
			{group.children.map((c, i) => (
				<div className="adv-row" key={c.id}>
					<div className="adv-conj">
						{i === 0 ? (
							<span>Where</span>
						) : i === 1 ? (
							<Select
								value={group.conjunction}
								options={[
									{ value: "and", label: "And" },
									{ value: "or", label: "Or" },
								]}
								width={120}
								ariaLabel="Combine rules with"
								onChange={(conjunction) => onChange({ ...group, conjunction })}
							/>
						) : (
							<span className="conj-t">{group.conjunction === "and" ? "And" : "Or"}</span>
						)}
					</div>
					{c.kind === "rule" ? (
						<AdvRule
							rule={c}
							properties={properties}
							byId={byId}
							today={today}
							canGroup={depth < 1}
							onChange={(r) => setChild(i, r)}
							onRemove={() => setChild(i, null)}
							onDuplicate={() => insertAfter(i, clone(c))}
							onGroup={() => setChild(i, { kind: "group", id: newId(), conjunction: "and", children: [c] })}
						/>
					) : (
						<div className="adv-group">
							<GroupBody group={c} depth={depth + 1} properties={properties} byId={byId} today={today} onChange={(g) => setChild(i, g)} />
							<RowMenu
								items={[
									{ label: "Remove group", icon: <Trash />, run: () => setChild(i, null) },
									{ label: "Duplicate group", icon: <Copy />, run: () => insertAfter(i, clone(c)) },
								]}
							/>
						</div>
					)}
				</div>
			))}
			<div className="adv-add">
				<button type="button" ref={addMenu.ref} className="ghost" onClick={depth < 1 ? addMenu.toggle : () => first && onChange({ ...group, children: [...group.children, newRule(first)] })}>
					<Plus />
					<span>Add filter rule</span>
					{depth < 1 ? <Chevron /> : null}
				</button>
				{addMenu.open ? (
					<Popover anchor={addMenu.el} onClose={addMenu.close} width={240}>
						<div className="menu">
							<MenuItem
								icon={<Plus />}
								onClick={() => {
									if (first) onChange({ ...group, children: [...group.children, newRule(first)] })
									addMenu.close()
								}}
							>
								Add filter rule
							</MenuItem>
							<MenuItem
								icon={<GroupIcon />}
								onClick={() => {
									if (first) onChange({ ...group, children: [...group.children, { kind: "group", id: newId(), conjunction: "and", children: [newRule(first)] }] })
									addMenu.close()
								}}
							>
								Add filter group
							</MenuItem>
						</div>
					</Popover>
				) : null}
			</div>
		</div>
	)
}

function AdvRule({
	rule,
	properties,
	byId,
	today,
	canGroup,
	onChange,
	onRemove,
	onDuplicate,
	onGroup,
}: {
	rule: Rule
	properties: FilterProperty[]
	byId: Map<string, FilterProperty>
	today: string
	canGroup: boolean
	onChange: (r: Rule) => void
	onRemove: () => void
	onDuplicate: () => void
	onGroup: () => void
}) {
	const pa = useAnchor()
	const p = byId.get(rule.propertyId)
	return (
		<div className="adv-rule">
			<button type="button" ref={pa.ref} className="sel prop" onClick={pa.toggle} aria-haspopup="menu">
				{p ? <PropIcon type={p.type} /> : null}
				<span>{p?.name ?? "Missing property"}</span>
				<Chevron />
			</button>
			{pa.open ? (
				<Popover anchor={pa.el} onClose={pa.close} width={260}>
					<PropertyMenu
						properties={properties}
						placeholder="Search for a property…"
						onPick={(np) => {
							onChange({ ...newRule(np), id: rule.id })
							pa.close()
						}}
					/>
				</Popover>
			) : null}
			{p ? (
				<>
					<Select
						value={rule.operator}
						options={operatorsFor(p).map((op) => ({ value: op, label: operatorLabel(op, p.kind) }))}
						onChange={(op) => onChange(withOperator(p, rule, op))}
						className="op"
						ariaLabel="Condition"
					/>
					<div className="adv-val">
						<ValueEditor rule={rule} p={p} today={today} compact onChange={(value) => onChange({ ...rule, value })} />
					</div>
				</>
			) : (
				<span className="adv-val" />
			)}
			<RowMenu
				items={[
					{ label: "Remove filter rule", icon: <Trash />, run: onRemove },
					{ label: "Duplicate rule", icon: <Copy />, run: onDuplicate },
					...(canGroup ? [{ label: "Turn into group", icon: <GroupIcon />, run: onGroup }] : []),
				]}
			/>
		</div>
	)
}

function RowMenu({ items }: { items: { label: string; icon: React.ReactNode; run: () => void }[] }) {
	const m = useAnchor()
	return (
		<>
			<button type="button" ref={m.ref} className="ghost ic rowmenu" aria-label="Rule actions" onClick={m.toggle}>
				<Dots />
			</button>
			{m.open ? (
				<Popover anchor={m.el} onClose={m.close} width={220}>
					<div className="menu">
						{items.map((it) => (
							<MenuItem
								key={it.label}
								icon={it.icon}
								onClick={() => {
									m.close()
									it.run()
								}}
							>
								{it.label}
							</MenuItem>
						))}
					</div>
				</Popover>
			) : null}
		</>
	)
}
