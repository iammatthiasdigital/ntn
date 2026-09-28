import { Worker } from "@notionhq/workers"

const worker = new Worker()
export default worker

worker.customBlock("orgChart", {
	path: "./blocks/orgchart-view",
	command: "npx vite build",
	output: "dist",
	version: 1,
	dataSources: {
		people: {
			name: "People",
			description:
				"People in the organization, each with a relation to their manager. Every other property " +
				"(Team, Location, Start date…) can be shown on the cards, used to color them, and filtered on.",
			icon: { type: "emoji", emoji: "🌳" },
			properties: {
				name: { name: "Name", type: "title" },
				role: { name: "Role", description: "Role or job title, shown under the name.", type: "rich_text" },
				reportsTo: { name: "Reports to", description: "Relation to this person's manager (a row in the same database).", type: "relation" },
				exitDate: {
					name: "Exit date",
					description: "Optional. Anyone with an exit date is left out of the chart for everybody; their reports move up to the next manager.",
					type: "date",
				},
			},
		},
	},
})
