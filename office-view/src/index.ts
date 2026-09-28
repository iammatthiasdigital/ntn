import { Worker } from "@notionhq/workers"

const worker = new Worker()
export default worker

worker.customBlock("office", {
	path: "./blocks/office-view",
	command: "npx vite build",
	output: "dist",
	version: 1,
	dataSources: {
		rooms: {
			name: "Rooms",
			description: "Optional: the rooms or areas of the office, grouped by floor. Rooms can be added from the block.",
			icon: { type: "emoji", emoji: "🚪" },
			properties: {
				name: { name: "Name", type: "title" },
				floor: { name: "Floor", description: "Groups rooms, e.g. 'Ground floor', '1st floor'.", type: "select" },
				type: { name: "Type", description: "e.g. Open space, Meeting, Quiet zone.", type: "select" },
			},
		},
		places: {
			name: "Places",
			description:
				"Everything that can be booked: desks, meeting rooms, phone booths, " +
				"parking spots. Places can be added from the block, and every property " +
				"can be used in the block's filter bar (e.g. Type = Desk, Features contains Monitor).",
			icon: { type: "emoji", emoji: "🪑" },
			properties: {
				name: { name: "Name", type: "title" },
				room: { name: "Room", description: "Relation to the room the place is in.", type: "relation" },
				type: { name: "Type", description: "Desk, Meeting room, Phone booth, Parking…", type: "select" },
				capacity: { name: "Seats", description: "How many people fit (meeting rooms).", type: "number" },
				features: { name: "Features", description: "e.g. Monitor, Standing desk, Video call.", type: "multi_select" },
				free: {
					name: "Always free",
					description: "Checked for open seating nobody books, e.g. cafeteria tables. Shown with its seats, never booked.",
					type: "checkbox",
				},
			},
		},
		bookings: {
			name: "Bookings",
			description: "One row per reservation, created by the block when someone books a place.",
			icon: { type: "emoji", emoji: "📅" },
			properties: {
				name: { name: "Name", type: "title" },
				place: { name: "Place", description: "Relation to the booked place.", type: "relation" },
				who: { name: "Who", description: "Who booked it.", type: "people" },
				when: { name: "When", description: "A date books the whole day (what the block does on one click); add start and end times for a slot.", type: "date" },
				note: { name: "Note", description: "Shown on the place, e.g. 'Gone after 12, feel free'.", type: "rich_text" },
				open: {
					name: "Up for grabs",
					description: "Checked when the booker is fine with someone else taking the place over; it then doesn't block new bookings.",
					type: "checkbox",
				},
			},
		},
	},
})
