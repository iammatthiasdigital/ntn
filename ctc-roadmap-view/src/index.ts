import { Worker } from "@notionhq/workers"

const worker = new Worker()
export default worker

worker.customBlock("ctcRoadmap", {
	path: "./blocks/ctc-roadmap-view",
	command: "npx vite build",
	output: "dist",
	version: 1,
	dataSources: {
		features: {
			name: "Features",
			description:
				"Feature roadmap items. The block keeps only rows whose tag " +
				"includes 'mandate' and whose product is 'Compliance transactions' " +
				"(both case-insensitive), and lays them out on a quarterly kanban " +
				"bucketed by ETA.",
			icon: { type: "emoji", emoji: "🗺️" },
			properties: {
				name: { name: "Name", type: "title" },
				tags: {
					name: "Tags",
					description:
						"Feature tags. Rows shown on the board carry a 'mandate' tag.",
					type: "multi_select",
				},
				product: {
					name: "Product",
					description:
						"Product line the feature belongs to. The board shows " +
						"'Compliance transactions'.",
					type: "select",
				},
				eta: {
					name: "ETA",
					description:
						"Planned delivery date. Its quarter decides the kanban column.",
					type: "date",
				},
				country: {
					name: "Country",
					description:
						"Country of the mandate, as an ISO 3166-1 alpha-2 code " +
						"(e.g. FR) or a full name (e.g. France).",
					type: "rich_text",
				},
				scopes: {
					name: "Scopes",
					description: "Mandate scopes, e.g. B2B, B2G, B2C, E-transport.",
					type: "multi_select",
				},
			},
		},
	},
})
