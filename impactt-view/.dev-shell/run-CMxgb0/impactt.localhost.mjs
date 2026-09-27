import { fileURLToPath } from "node:url"
import base from "../../blocks/impactt-view/vite.config.ts"

const here = p => fileURLToPath(new URL(p, import.meta.url))
const resolved =
	typeof base === "function"
		? await base({ command: "serve", mode: "development" })
		: await base

const manifest = "{\"version\":1,\"dataSources\":{\"initiatives\":{\"name\":\"Initiatives\",\"description\":\"The initiatives drawn as bars. Each row needs a Plan date range; its KPI impact comes from the Impacts database. Every property of this database can be used in the block's filter bar.\",\"icon\":{\"type\":\"emoji\",\"emoji\":\"🚀\"},\"properties\":{\"name\":{\"name\":\"Name\",\"type\":\"title\"},\"plan\":{\"name\":\"Plan\",\"description\":\"Planned window (a date range). A single date plans the whole month it falls in.\",\"type\":\"date\"},\"start\":{\"name\":\"Started\",\"description\":\"Actual start, when it differs from the plan.\",\"type\":\"date\"},\"done\":{\"name\":\"Done\",\"description\":\"Actual finish date. Set once the initiative is complete.\",\"type\":\"date\"},\"timing\":{\"name\":\"If off plan\",\"description\":\"'Timeline moves' (impact is kept, the end date slips) or 'Impact changes' (the date is fixed, the impact shrinks or grows). Empty uses the block default.\",\"type\":\"select\"},\"growth\":{\"name\":\"Growth\",\"description\":\"'Linear' or 'Exponential' ramp of the impact.\",\"type\":\"select\"},\"note\":{\"name\":\"Note\",\"description\":\"Shown in the bar's tooltip.\",\"type\":\"rich_text\"}}},\"kpis\":{\"name\":\"KPIs\",\"description\":\"Optional details for the KPIs named in the Impacts database: unit, baseline, direction and goal. Matched by relation, or by title when Impacts names KPIs with a select or multi-select.\",\"icon\":{\"type\":\"emoji\",\"emoji\":\"🎯\"},\"properties\":{\"name\":{\"name\":\"Name\",\"type\":\"title\"},\"unit\":{\"name\":\"Unit\",\"description\":\"'Number', 'Percent', 'EUR' or 'USD'.\",\"type\":\"select\"},\"baseline\":{\"name\":\"Baseline\",\"description\":\"The KPI's value before the first initiative.\",\"type\":\"number\"},\"direction\":{\"name\":\"Direction\",\"description\":\"'Increase' or 'Decrease' (burndown KPIs such as churn or cost, where initiatives have negative impact).\",\"type\":\"select\"},\"goal\":{\"name\":\"Goal\",\"description\":\"Target value. Empty uses the total of the plan.\",\"type\":\"number\"},\"goalBy\":{\"name\":\"Goal by\",\"description\":\"When the goal should be reached.\",\"type\":\"date\"},\"range\":{\"name\":\"Range ±\",\"description\":\"Uncertainty of the projection as a fraction (0.3 = ±30%). Empty uses 0.3.\",\"type\":\"number\"}}},\"impacts\":{\"name\":\"Impacts\",\"description\":\"One row per initiative and KPI it moves: the planned change and what it has achieved so far.\",\"icon\":{\"type\":\"emoji\",\"emoji\":\"📈\"},\"properties\":{\"name\":{\"name\":\"Name\",\"type\":\"title\"},\"initiative\":{\"name\":\"Initiative\",\"description\":\"Relation to the initiative.\",\"type\":\"relation\"},\"kpi\":{\"name\":\"KPI\",\"description\":\"Relation to the KPI. The block's settings can instead use any select or multi-select column of this database as the KPI.\",\"type\":\"relation\"},\"planned\":{\"name\":\"Planned\",\"description\":\"Planned change of the KPI (negative for burndown KPIs).\",\"type\":\"number\"},\"achieved\":{\"name\":\"Achieved\",\"description\":\"Change achieved so far.\",\"type\":\"number\"}}}}}"

// Inject before the block entry module so errors thrown during module
// evaluation are reported even when the block never sends connect.
const captureRuntimeErrors = {
	name: "dev-shell:capture-runtime-errors",
	transformIndexHtml: {
		order: "pre",
		handler() {
			return [{
				tag: "script",
				attrs: { type: "module" },
				children: "\nconst MESSAGE_TYPE = \"notion-custom-blocks-dev-shell:runtime-error\"\n\nfunction report(error, fallback, location) {\n\tconst message =\n\t\ttypeof error === \"object\" &&\n\t\terror !== null &&\n\t\ttypeof error.message === \"string\"\n\t\t\t? error.message\n\t\t\t: typeof error === \"string\"\n\t\t\t\t? error\n\t\t\t\t: fallback\n\tconst stack =\n\t\ttypeof error === \"object\" &&\n\t\terror !== null &&\n\t\ttypeof error.stack === \"string\"\n\t\t\t? error.stack\n\t\t\t: undefined\n\tconst filename =\n\t\tlocation !== undefined && typeof location.filename === \"string\"\n\t\t\t? location.filename\n\t\t\t: undefined\n\tconst lineno =\n\t\tlocation !== undefined && typeof location.lineno === \"number\"\n\t\t\t? location.lineno\n\t\t\t: undefined\n\tconst colno =\n\t\tlocation !== undefined && typeof location.colno === \"number\"\n\t\t\t? location.colno\n\t\t\t: undefined\n\twindow.parent.postMessage({\n\t\ttype: MESSAGE_TYPE,\n\t\terror: { message, stack, filename, lineno, colno },\n\t}, \"*\")\n}\n\nwindow.addEventListener(\"error\", event => {\n\treport(event.error, event.message || \"Uncaught error\", {\n\t\tfilename: event.filename,\n\t\tlineno: event.lineno,\n\t\tcolno: event.colno,\n\t})\n})\n\nwindow.addEventListener(\"unhandledrejection\", event => {\n\treport(event.reason, \"Unhandled promise rejection\")\n})\n",
				injectTo: "head-pre",
			}]
		},
	},
}

const serveWorkerManifest = {
	name: "dev-shell:worker-block-manifest",
	enforce: "pre",
	configureServer(server) {
		server.middlewares.use((req, res, next) => {
			if (req.url?.split("?", 1)[0] !== "/manifest") {
				next()
				return
			}
			res.setHeader("Content-Type", "application/json")
			res.end(manifest)
		})
	},
}

export default {
	...resolved,
	root: here("../../blocks/impactt-view"),
	cacheDir: here("./cache/impactt.localhost"),
	server: {
		...(resolved.server ?? {}),
		// Block servers are local development dependencies of the shell.
		host: "127.0.0.1",
	},
	define: {
		...(resolved.define ?? {}),
		// Initialization handshake scenarios fixture uses this key to identify the
		// selected scenario, via the custom block capability key. The key needs to be
		// serialized as a JavaScript string literal, then serialized again for this
		// generated config.
		"import.meta.env.VITE_CUSTOM_BLOCK_KEY": "\"impactt\"",
	},
	plugins: [
		serveWorkerManifest,
		captureRuntimeErrors,
		...(resolved.plugins ?? []),
	],
}
