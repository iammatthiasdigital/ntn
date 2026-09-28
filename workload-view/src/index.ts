import { Worker } from "@notionhq/workers"

const worker = new Worker()
export default worker

worker.customBlock("workload", {
	path: "./blocks/workload-view",
	command: "npx vite build",
	output: "dist",
	version: 1,
	dataSources: {
		assignments: {
			name: "Assignments",
			description:
				"Who (or what) works on what, when, and how much. Each row " +
				"spreads its effort over its date range; overlapping rows add up " +
				"into the workload. Any property can group the lanes or color " +
				"the load, and every property can be used in the filter bar.",
			icon: { type: "emoji", emoji: "⚖️" },
			properties: {
				name: { name: "Name", type: "title" },
				who: {
					name: "Who",
					description: "The person the load belongs to. The block can group by any other property instead (team, machine, room…).",
					type: "people",
				},
				dates: {
					name: "Dates",
					description: "When the work happens (a date range; a single date is one day).",
					type: "date",
				},
				effort: {
					name: "Effort",
					description:
						"A % allocation (50 = half of someone's time; Notion's percent format works too), " +
						"hours for the whole assignment, or hours per day. The block guesses from the " +
						"column name and it can be changed in the settings. Any number column can be used.",
					type: "number",
				},
				project: {
					name: "Project",
					description: "Optional: colors the load by project. Any select, relation or people property works too.",
					type: "select",
				},
			},
		},
		people: {
			name: "People",
			description:
				"Optional: each person's working time. Without a row, a person gets the " +
				"block's default (8 h a day, or 100%). Rows match the Who column by Person, " +
				"or by name when lanes are grouped by something else.",
			icon: { type: "emoji", emoji: "🧑‍💻" },
			properties: {
				name: { name: "Name", type: "title" },
				person: { name: "Person", description: "The Notion user.", type: "people" },
				hours: { name: "Hours per week", description: "e.g. 40, 32 or 20.", type: "number" },
				workload: { name: "Workload %", description: "Share of a full-time week, e.g. 80 (or 0.8). Used when Hours per week is empty.", type: "number" },
			},
		},
	},
})
