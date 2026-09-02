/**
 * Country resolution: accepts an ISO 3166-1 alpha-2 code ("FR") or a full
 * name ("France", "Türkiye", "USA") and yields a canonical display name plus
 * the alpha-2 code when one could be determined. The flag emoji is derived
 * from the code via regional indicator symbols.
 */

const ISO2_CODES =
	"AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI " +
	"BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN " +
	"CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK " +
	"FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM " +
	"HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN " +
	"KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK " +
	"ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP " +
	"NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
	"SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF " +
	"TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI " +
	"VN VU WF WS YE YT ZA ZM ZW"

const ISO2_SET: ReadonlySet<string> = new Set(ISO2_CODES.split(" "))

/** Normalized-name aliases for spellings Intl.DisplayNames doesn't emit. */
const NAME_ALIASES: Record<string, string> = {
	usa: "US",
	"united states of america": "US",
	america: "US",
	uk: "GB",
	"great britain": "GB",
	england: "GB",
	uae: "AE",
	emirates: "AE",
	turkey: "TR",
	korea: "KR",
	"south korea": "KR",
	"korea south": "KR",
	"republic of korea": "KR",
	"north korea": "KP",
	"korea north": "KP",
	"czech republic": "CZ",
	"ivory coast": "CI",
	vietnam: "VN",
	"viet nam": "VN",
	laos: "LA",
	syria: "SY",
	iran: "IR",
	russia: "RU",
	venezuela: "VE",
	bolivia: "BO",
	tanzania: "TZ",
	moldova: "MD",
	brunei: "BN",
	"cape verde": "CV",
	palestine: "PS",
	macedonia: "MK",
	myanmar: "MM",
	burma: "MM",
	holland: "NL",
	swaziland: "SZ",
	"east timor": "TL",
	vatican: "VA",
	"vatican city": "VA",
	"dr congo": "CD",
	"democratic republic of the congo": "CD",
	"republic of the congo": "CG",
	congo: "CG",
	"hong kong": "HK",
	macau: "MO",
	macao: "MO",
	slovak_republic: "SK",
	"slovak republic": "SK",
}

let displayNames: Intl.DisplayNames | null | undefined
function regionDisplayNames(): Intl.DisplayNames | null {
	if (displayNames !== undefined) return displayNames
	try {
		displayNames = new Intl.DisplayNames(["en"], { type: "region" })
	} catch {
		displayNames = null
	}
	return displayNames
}

export function countryNameFromIso2(iso2: string): string | null {
	const code = iso2.toUpperCase()
	if (!ISO2_SET.has(code)) return null
	try {
		const name = regionDisplayNames()?.of(code)
		return name && name !== code ? name : null
	} catch {
		return null
	}
}

/** Lowercase, strip diacritics, collapse punctuation to single spaces. */
export function normalizeCountryKey(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

let nameToIso2: Map<string, string> | null = null
function nameLookup(): Map<string, string> {
	if (nameToIso2) return nameToIso2
	nameToIso2 = new Map()
	for (const code of ISO2_SET) {
		const name = countryNameFromIso2(code)
		if (name) nameToIso2.set(normalizeCountryKey(name), code)
	}
	for (const [alias, code] of Object.entries(NAME_ALIASES)) {
		nameToIso2.set(normalizeCountryKey(alias), code)
	}
	return nameToIso2
}

export type ResolvedCountry = { name: string; iso2: string | null }

function fromIso2(code: string): ResolvedCountry {
	const upper = code.toUpperCase()
	return { name: countryNameFromIso2(upper) ?? upper, iso2: upper }
}

/**
 * Resolve free-form country input. Accepts a bare alpha-2 code ("KR",
 * "kr "), a full name, an alias, a code with a label ("KR - South Korea"),
 * or a trailing parenthesized code ("Korea (KR)"). Unresolvable input is
 * passed through as the display name so the card still reads sensibly.
 */
export function resolveCountry(input: string): ResolvedCountry | null {
	// Rich text likes to smuggle in NBSPs and zero-width characters.
	const raw = input
		.replace(/[\u00a0\u2007\u202f]/g, " ")
		.replace(/[\u200b-\u200d\ufeff]/g, "")
		.trim()
	if (raw === "") return null
	if (/^[A-Za-z]{2}$/.test(raw) && ISO2_SET.has(raw.toUpperCase())) {
		return fromIso2(raw)
	}
	const code = nameLookup().get(normalizeCountryKey(raw))
	if (code) return { name: countryNameFromIso2(code) ?? raw, iso2: code }
	const leading = /^([A-Za-z]{2})[\s\-–—:/(,.]/.exec(raw)
	if (leading && ISO2_SET.has(leading[1].toUpperCase())) {
		return fromIso2(leading[1])
	}
	const trailing = /[([]([A-Za-z]{2})[)\]]\s*$/.exec(raw)
	if (trailing && ISO2_SET.has(trailing[1].toUpperCase())) {
		return fromIso2(trailing[1])
	}
	return { name: raw, iso2: null }
}

/** Regional-indicator flag emoji for an alpha-2 code, e.g. "FR" → 🇫🇷. */
export function flagEmoji(iso2: string): string {
	const code = iso2.toUpperCase()
	if (!/^[A-Z]{2}$/.test(code)) return "🌐"
	return String.fromCodePoint(
		0x1f1e6 + code.charCodeAt(0) - 65,
		0x1f1e6 + code.charCodeAt(1) - 65
	)
}
