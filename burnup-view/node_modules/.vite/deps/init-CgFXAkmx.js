var DEFAULT_CONFIG = {
	lang: void 0,
	message: void 0,
	abortEarly: void 0,
	abortPipeEarly: void 0
};
/**
* Returns the global configuration.
*
* @param config The config to merge.
*
* @returns The configuration.
*/
/* @__NO_SIDE_EFFECTS__ */
function getGlobalConfig(config$1) {
	if (!config$1 && true) return DEFAULT_CONFIG;
	return {
		lang: config$1?.lang ?? void 0,
		message: config$1?.message,
		abortEarly: config$1?.abortEarly ?? void 0,
		abortPipeEarly: config$1?.abortPipeEarly ?? void 0
	};
}
/**
* Stringifies an unknown input to a literal or type string.
*
* @param input The unknown input.
*
* @returns A literal or type string.
*
* @internal
*/
/* @__NO_SIDE_EFFECTS__ */
function _stringify(input) {
	const type = typeof input;
	if (type === "string") return `"${input}"`;
	if (type === "number" || type === "bigint" || type === "boolean") return `${input}`;
	if (type === "object" || type === "function") return (input && Object.getPrototypeOf(input)?.constructor?.name) ?? "null";
	return type;
}
/**
* Adds an issue to the dataset.
*
* @param context The issue context.
* @param label The issue label.
* @param dataset The input dataset.
* @param config The configuration.
* @param other The optional props.
*
* @internal
*/
function _addIssue(context, label, dataset, config$1, other) {
	const input = other && "input" in other ? other.input : dataset.value;
	const expected = other?.expected ?? context.expects ?? null;
	const received = other?.received ?? /* @__PURE__ */ _stringify(input);
	const issue = {
		kind: context.kind,
		type: context.type,
		input,
		expected,
		received,
		message: `Invalid ${label}: ${expected ? `Expected ${expected} but r` : "R"}eceived ${received}`,
		requirement: context.requirement,
		path: other?.path,
		issues: other?.issues,
		lang: config$1.lang,
		abortEarly: config$1.abortEarly,
		abortPipeEarly: config$1.abortPipeEarly
	};
	const isSchema = context.kind === "schema";
	const message$1 = other?.message ?? context.message ?? (context.reference, issue.lang, void 0) ?? (isSchema ? (issue.lang, void 0) : null) ?? config$1.message ?? (issue.lang, void 0);
	if (message$1 !== void 0) issue.message = typeof message$1 === "function" ? message$1(issue) : message$1;
	if (isSchema) dataset.typed = false;
	if (dataset.issues) dataset.issues.push(issue);
	else dataset.issues = [issue];
}
/**
* Compares two values using the SameValueZero algorithm, which treats `NaN`
* as equal to itself unlike `===`.
*
* @param value1 The first value.
* @param value2 The second value.
*
* @returns Whether the values are equal.
*
* @internal
*/
/* @__NO_SIDE_EFFECTS__ */
function _isSameValueZero(value1, value2) {
	return value1 === value2 || Number.isNaN(value1) && Number.isNaN(value2);
}
/**
* Disallows inherited object properties and prevents object prototype
* pollution by disallowing certain keys.
*
* @param object The object to check.
* @param key The key to check.
*
* @returns Whether the key is allowed.
*
* @internal
*/
/* @__NO_SIDE_EFFECTS__ */
function _isValidObjectKey(object$1, key) {
	return Object.prototype.hasOwnProperty.call(object$1, key) && key !== "__proto__" && key !== "prototype" && key !== "constructor";
}
/**
* Joins multiple `expects` values with the given separator.
*
* @param values The `expects` values.
* @param separator The separator.
*
* @returns The joined `expects` property.
*
* @internal
*/
/* @__NO_SIDE_EFFECTS__ */
function _joinExpects(values$1, separator) {
	const list = [...new Set(values$1)];
	if (list.length > 1) return `(${list.join(` ${separator} `)})`;
	return list[0] ?? "never";
}
/**
* Eagerly creates and attaches the Standard Schema properties of a schema.
*
* Hint: The contextual `this` type includes the standard properties that are
* attached before the schema is returned.
*
* @param schema The schema to attach standard properties to.
*
* @returns The schema with standard properties attached.
*
* @internal
*/
function _standardSchema(schema) {
	schema["~standard"] = {
		version: 1,
		vendor: "valibot",
		validate: (value$1) => schema["~run"]({ value: value$1 }, /* @__PURE__ */ getGlobalConfig())
	};
	return schema;
}
/**
* A Valibot error with useful information.
*/
var ValiError = class extends Error {
	/**
	* Creates a Valibot error with useful information.
	*
	* @param issues The error issues.
	*/
	constructor(issues) {
		super(issues[0].message);
		this.name = "ValiError";
		this.issues = issues;
	}
};
/**
* Creates a brand transformation action.
*
* @param name The brand name.
*
* @returns A brand action.
*/
/* @__NO_SIDE_EFFECTS__ */
function brand(name) {
	return {
		kind: "transformation",
		type: "brand",
		reference: brand,
		async: false,
		name,
		"~run"(dataset) {
			return dataset;
		}
	};
}
var ABORT_EARLY_CONFIG = { abortEarly: true };
/**
* Returns the fallback value of the schema.
*
* @param schema The schema to get it from.
* @param dataset The output dataset if available.
* @param config The config if available.
*
* @returns The fallback value.
*/
/* @__NO_SIDE_EFFECTS__ */
function getFallback(schema, dataset, config$1) {
	return typeof schema.fallback === "function" ? schema.fallback(dataset, config$1) : schema.fallback;
}
/**
* Returns the default value of the schema.
*
* @param schema The schema to get it from.
* @param dataset The input dataset if available.
* @param config The config if available.
*
* @returns The default value.
*/
/* @__NO_SIDE_EFFECTS__ */
function getDefault(schema, dataset, config$1) {
	return typeof schema.default === "function" ? schema.default(dataset, config$1) : schema.default;
}
/* @__NO_SIDE_EFFECTS__ */
function array(item, message$1) {
	return _standardSchema({
		kind: "schema",
		type: "array",
		reference: array,
		expects: "Array",
		async: false,
		item,
		message: message$1,
		"~run"(dataset, config$1) {
			const input = dataset.value;
			if (Array.isArray(input)) {
				dataset.typed = true;
				dataset.value = [];
				for (let key = 0; key < input.length; key++) {
					const value$1 = input[key];
					const itemDataset = this.item["~run"]({ value: value$1 }, config$1);
					if (itemDataset.issues) {
						const pathItem = {
							type: "array",
							origin: "value",
							input,
							key,
							value: value$1
						};
						for (const issue of itemDataset.issues) {
							if (issue.path) issue.path.unshift(pathItem);
							else issue.path = [pathItem];
							dataset.issues?.push(issue);
						}
						if (!dataset.issues) dataset.issues = itemDataset.issues;
						if (config$1.abortEarly) {
							dataset.typed = false;
							break;
						}
					}
					if (!itemDataset.typed) dataset.typed = false;
					dataset.value.push(itemDataset.value);
				}
			} else _addIssue(this, "type", dataset, config$1);
			return dataset;
		}
	});
}
/* @__NO_SIDE_EFFECTS__ */
function boolean(message$1) {
	return _standardSchema({
		kind: "schema",
		type: "boolean",
		reference: boolean,
		expects: "boolean",
		async: false,
		message: message$1,
		"~run"(dataset, config$1) {
			if (typeof dataset.value === "boolean") dataset.typed = true;
			else _addIssue(this, "type", dataset, config$1);
			return dataset;
		}
	});
}
/* @__NO_SIDE_EFFECTS__ */
function literal(literal_, message$1) {
	return _standardSchema({
		kind: "schema",
		type: "literal",
		reference: literal,
		expects: /* @__PURE__ */ _stringify(literal_),
		async: false,
		literal: literal_,
		message: message$1,
		"~run"(dataset, config$1) {
			if (/* @__PURE__ */ _isSameValueZero(dataset.value, this.literal)) dataset.typed = true;
			else _addIssue(this, "type", dataset, config$1);
			return dataset;
		}
	});
}
/* @__NO_SIDE_EFFECTS__ */
function nullable(wrapped, default_) {
	return _standardSchema({
		kind: "schema",
		type: "nullable",
		reference: nullable,
		expects: `(${wrapped.expects} | null)`,
		async: false,
		wrapped,
		default: default_,
		"~run"(dataset, config$1) {
			if (dataset.value === null) {
				if (this.default !== void 0) dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
				if (dataset.value === null) {
					dataset.typed = true;
					return dataset;
				}
			}
			return this.wrapped["~run"](dataset, config$1);
		}
	});
}
/* @__NO_SIDE_EFFECTS__ */
function number(message$1) {
	return _standardSchema({
		kind: "schema",
		type: "number",
		reference: number,
		expects: "number",
		async: false,
		message: message$1,
		"~run"(dataset, config$1) {
			if (typeof dataset.value === "number" && !isNaN(dataset.value)) dataset.typed = true;
			else _addIssue(this, "type", dataset, config$1);
			return dataset;
		}
	});
}
/* @__NO_SIDE_EFFECTS__ */
function object(entries$1, message$1) {
	return _standardSchema({
		kind: "schema",
		type: "object",
		reference: object,
		expects: "Object",
		async: false,
		entries: entries$1,
		message: message$1,
		"~run"(dataset, config$1) {
			const input = dataset.value;
			if (input && typeof input === "object") {
				dataset.typed = true;
				dataset.value = {};
				for (const key in this.entries) {
					const valueSchema = this.entries[key];
					if (key in input || (valueSchema.type === "exact_optional" || valueSchema.type === "optional" || valueSchema.type === "nullish") && valueSchema.default !== void 0) {
						const value$1 = key in input ? input[key] : /* @__PURE__ */ getDefault(valueSchema);
						const valueDataset = valueSchema["~run"]({ value: value$1 }, config$1);
						if (valueDataset.issues) {
							const pathItem = {
								type: "object",
								origin: "value",
								input,
								key,
								value: value$1
							};
							for (const issue of valueDataset.issues) {
								if (issue.path) issue.path.unshift(pathItem);
								else issue.path = [pathItem];
								dataset.issues?.push(issue);
							}
							if (!dataset.issues) dataset.issues = valueDataset.issues;
							if (config$1.abortEarly) {
								dataset.typed = false;
								break;
							}
						}
						if (!valueDataset.typed) dataset.typed = false;
						dataset.value[key] = valueDataset.value;
					} else if (valueSchema.fallback !== void 0) dataset.value[key] = /* @__PURE__ */ getFallback(valueSchema);
					else if (valueSchema.type !== "exact_optional" && valueSchema.type !== "optional" && valueSchema.type !== "nullish") {
						_addIssue(this, "key", dataset, config$1, {
							input: void 0,
							expected: `"${key}"`,
							path: [{
								type: "object",
								origin: "key",
								input,
								key,
								value: input[key]
							}]
						});
						if (config$1.abortEarly) break;
					}
				}
			} else _addIssue(this, "type", dataset, config$1);
			return dataset;
		}
	});
}
/* @__NO_SIDE_EFFECTS__ */
function optional(wrapped, default_) {
	return _standardSchema({
		kind: "schema",
		type: "optional",
		reference: optional,
		expects: `(${wrapped.expects} | undefined)`,
		async: false,
		wrapped,
		default: default_,
		"~run"(dataset, config$1) {
			if (dataset.value === void 0) {
				if (this.default !== void 0) dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
				if (dataset.value === void 0) {
					dataset.typed = true;
					return dataset;
				}
			}
			return this.wrapped["~run"](dataset, config$1);
		}
	});
}
/* @__NO_SIDE_EFFECTS__ */
function picklist(options, message$1) {
	return _standardSchema({
		kind: "schema",
		type: "picklist",
		reference: picklist,
		expects: /* @__PURE__ */ _joinExpects(options.map(_stringify), "|"),
		async: false,
		options,
		message: message$1,
		"~run"(dataset, config$1) {
			if (this.options.includes(dataset.value)) dataset.typed = true;
			else _addIssue(this, "type", dataset, config$1);
			return dataset;
		}
	});
}
/* @__NO_SIDE_EFFECTS__ */
function record(key, value$1, message$1) {
	return _standardSchema({
		kind: "schema",
		type: "record",
		reference: record,
		expects: "Object",
		async: false,
		key,
		value: value$1,
		message: message$1,
		"~run"(dataset, config$1) {
			const input = dataset.value;
			if (input && typeof input === "object") {
				dataset.typed = true;
				dataset.value = {};
				for (const entryKey in input) if (/* @__PURE__ */ _isValidObjectKey(input, entryKey)) {
					const entryValue = input[entryKey];
					const keyDataset = this.key["~run"]({ value: entryKey }, config$1);
					if (keyDataset.issues) {
						const pathItem = {
							type: "object",
							origin: "key",
							input,
							key: entryKey,
							value: entryValue
						};
						for (const issue of keyDataset.issues) {
							issue.path = [pathItem];
							dataset.issues?.push(issue);
						}
						if (!dataset.issues) dataset.issues = keyDataset.issues;
						if (config$1.abortEarly) {
							dataset.typed = false;
							break;
						}
					}
					const valueDataset = this.value["~run"]({ value: entryValue }, config$1);
					if (valueDataset.issues) {
						const pathItem = {
							type: "object",
							origin: "value",
							input,
							key: entryKey,
							value: entryValue
						};
						for (const issue of valueDataset.issues) {
							if (issue.path) issue.path.unshift(pathItem);
							else issue.path = [pathItem];
							dataset.issues?.push(issue);
						}
						if (!dataset.issues) dataset.issues = valueDataset.issues;
						if (config$1.abortEarly) {
							dataset.typed = false;
							break;
						}
					}
					if (!keyDataset.typed || !valueDataset.typed) dataset.typed = false;
					if (keyDataset.typed) dataset.value[keyDataset.value] = valueDataset.value;
				}
			} else _addIssue(this, "type", dataset, config$1);
			return dataset;
		}
	});
}
/* @__NO_SIDE_EFFECTS__ */
function string(message$1) {
	return _standardSchema({
		kind: "schema",
		type: "string",
		reference: string,
		expects: "string",
		async: false,
		message: message$1,
		"~run"(dataset, config$1) {
			if (typeof dataset.value === "string") dataset.typed = true;
			else _addIssue(this, "type", dataset, config$1);
			return dataset;
		}
	});
}
/**
* Returns the sub issues of the provided datasets for the union issue.
*
* @param datasets The datasets.
*
* @returns The sub issues.
*
* @internal
*/
/* @__NO_SIDE_EFFECTS__ */
function _subIssues(datasets) {
	let issues;
	if (datasets) for (const dataset of datasets) if (issues) for (const issue of dataset.issues) issues.push(issue);
	else issues = dataset.issues;
	return issues;
}
/* @__NO_SIDE_EFFECTS__ */
function union(options, message$1) {
	return _standardSchema({
		kind: "schema",
		type: "union",
		reference: union,
		expects: /* @__PURE__ */ _joinExpects(options.map((option) => option.expects), "|"),
		async: false,
		options,
		message: message$1,
		"~run"(dataset, config$1) {
			let validDataset;
			let typedDatasets;
			let untypedDatasets;
			for (const schema of this.options) {
				const optionDataset = schema["~run"]({ value: dataset.value }, config$1);
				if (optionDataset.typed) if (optionDataset.issues) if (typedDatasets) typedDatasets.push(optionDataset);
				else typedDatasets = [optionDataset];
				else {
					validDataset = optionDataset;
					break;
				}
				else if (untypedDatasets) untypedDatasets.push(optionDataset);
				else untypedDatasets = [optionDataset];
			}
			if (validDataset) return validDataset;
			if (typedDatasets) {
				if (typedDatasets.length === 1) return typedDatasets[0];
				_addIssue(this, "type", dataset, config$1, { issues: /* @__PURE__ */ _subIssues(typedDatasets) });
				dataset.typed = true;
			} else if (untypedDatasets?.length === 1) return untypedDatasets[0];
			else _addIssue(this, "type", dataset, config$1, { issues: /* @__PURE__ */ _subIssues(untypedDatasets) });
			return dataset;
		}
	});
}
/**
* Creates a unknown schema.
*
* @returns A unknown schema.
*/
/* @__NO_SIDE_EFFECTS__ */
function unknown() {
	return _standardSchema({
		kind: "schema",
		type: "unknown",
		reference: unknown,
		expects: "unknown",
		async: false,
		"~run"(dataset) {
			dataset.typed = true;
			return dataset;
		}
	});
}
/* @__NO_SIDE_EFFECTS__ */
function variant(key, options, message$1) {
	return _standardSchema({
		kind: "schema",
		type: "variant",
		reference: variant,
		expects: "Object",
		async: false,
		key,
		options,
		message: message$1,
		"~run"(dataset, config$1) {
			const input = dataset.value;
			if (input && typeof input === "object") {
				let outputDataset;
				let maxDiscriminatorPriority = 0;
				let invalidDiscriminatorKey = this.key;
				let expectedDiscriminators = [];
				const parseOptions = (variant$1, allKeys) => {
					for (const schema of variant$1.options) {
						if (schema.type === "variant") parseOptions(schema, new Set(allKeys).add(schema.key));
						else {
							let keysAreValid = true;
							let currentPriority = 0;
							for (const currentKey of allKeys) {
								const discriminatorSchema = schema.entries[currentKey];
								if (currentKey in input ? discriminatorSchema["~run"]({
									typed: false,
									value: input[currentKey]
								}, ABORT_EARLY_CONFIG).issues : discriminatorSchema.type !== "exact_optional" && discriminatorSchema.type !== "optional" && discriminatorSchema.type !== "nullish") {
									keysAreValid = false;
									if (invalidDiscriminatorKey !== currentKey && (maxDiscriminatorPriority < currentPriority || maxDiscriminatorPriority === currentPriority && currentKey in input && !(invalidDiscriminatorKey in input))) {
										maxDiscriminatorPriority = currentPriority;
										invalidDiscriminatorKey = currentKey;
										expectedDiscriminators = [];
									}
									if (invalidDiscriminatorKey === currentKey) expectedDiscriminators.push(schema.entries[currentKey].expects);
									break;
								}
								currentPriority++;
							}
							if (keysAreValid) {
								const optionDataset = schema["~run"]({ value: input }, config$1);
								if (!outputDataset || !outputDataset.typed && optionDataset.typed) outputDataset = optionDataset;
							}
						}
						if (outputDataset && !outputDataset.issues) break;
					}
				};
				parseOptions(this, /* @__PURE__ */ new Set([this.key]));
				if (outputDataset) return outputDataset;
				_addIssue(this, "type", dataset, config$1, {
					input: input[invalidDiscriminatorKey],
					expected: /* @__PURE__ */ _joinExpects(expectedDiscriminators, "|"),
					path: [{
						type: "object",
						origin: "value",
						input,
						key: invalidDiscriminatorKey,
						value: input[invalidDiscriminatorKey]
					}]
				});
			} else _addIssue(this, "type", dataset, config$1);
			return dataset;
		}
	});
}
/**
* Parses an unknown input based on a schema.
*
* @param schema The schema to be used.
* @param input The input to be parsed.
* @param config The parse configuration.
*
* @returns The parsed input.
*/
function parse(schema, input, config$1) {
	const dataset = schema["~run"]({ value: input }, /* @__PURE__ */ getGlobalConfig(config$1));
	if (dataset.issues) throw new ValiError(dataset.issues);
	return dataset.value;
}
/* @__NO_SIDE_EFFECTS__ */
function pipe(...pipe$1) {
	return _standardSchema({
		...pipe$1[0],
		pipe: pipe$1,
		"~run"(dataset, config$1) {
			for (const item of pipe$1) if (item.kind !== "metadata") {
				if (dataset.issues && (item.kind === "schema" || item.kind === "transformation")) {
					dataset.typed = false;
					break;
				}
				if (!dataset.issues || !config$1.abortEarly && !config$1.abortPipeEarly) dataset = item["~run"](dataset, config$1);
			}
			return dataset;
		}
	});
}
/**
* Parses an unknown input based on a schema.
*
* @param schema The schema to be used.
* @param input The input to be parsed.
* @param config The parse configuration.
*
* @returns The parse result.
*/
/* @__NO_SIDE_EFFECTS__ */
function safeParse(schema, input, config$1) {
	const dataset = schema["~run"]({ value: input }, /* @__PURE__ */ getGlobalConfig(config$1));
	return {
		typed: dataset.typed,
		success: !dataset.issues,
		output: dataset.value,
		issues: dataset.issues
	};
}
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/dataSources/propertySchema.js
/**
* Hex-token identifiers for Notion's named colors. Mirrors the public API's
* `select.options[].color` enum
* (https://developers.notion.com/reference/property-object#select).
*/
var notionPropertyColorSchema = /* @__PURE__ */ picklist([
	"default",
	"gray",
	"brown",
	"orange",
	"yellow",
	"green",
	"blue",
	"purple",
	"pink",
	"red",
	"gray_background",
	"brown_background",
	"orange_background",
	"yellow_background",
	"green_background",
	"blue_background",
	"purple_background",
	"pink_background",
	"red_background",
	"default_background"
]);
var notionPropertyOptionSchema = /* @__PURE__ */ object({
	id: /* @__PURE__ */ string(),
	name: /* @__PURE__ */ string(),
	color: /* @__PURE__ */ optional(notionPropertyColorSchema),
	description: /* @__PURE__ */ optional(/* @__PURE__ */ string())
});
var notionStatusGroupSchema = /* @__PURE__ */ object({
	id: /* @__PURE__ */ string(),
	name: /* @__PURE__ */ string(),
	color: /* @__PURE__ */ optional(notionPropertyColorSchema),
	option_ids: /* @__PURE__ */ array(/* @__PURE__ */ string())
});
var notionDualPropertySchema = /* @__PURE__ */ object({
	synced_property_id: /* @__PURE__ */ string(),
	synced_property_name: /* @__PURE__ */ string()
});
var baseProp = /* @__PURE__ */ object({
	name: /* @__PURE__ */ string(),
	description: /* @__PURE__ */ optional(/* @__PURE__ */ string())
});
/**
* Every Notion property type the bridge speaks, in a single readable list.
* Mirrors the Notion public API
* [property object](https://developers.notion.com/reference/property-object)
* type field. Internal-only types (`button`, `verification`,
* `last_visited_time`, `location`) and the four built-ins (`created_time`,
* `last_edited_time`, `created_by`, `last_edited_by`) are included under their
* bridge-native names.
*/
var NOTION_PROPERTY_TYPES = [
	"title",
	"rich_text",
	"number",
	"checkbox",
	"url",
	"email",
	"phone_number",
	"select",
	"multi_select",
	"status",
	"date",
	"people",
	"files",
	"unique_id",
	"relation",
	"place",
	"formula",
	"rollup",
	"button",
	"verification",
	"last_visited_time",
	"location",
	"created_time",
	"last_edited_time",
	"created_by",
	"last_edited_by"
];
var notionPropertyTypeSchema = /* @__PURE__ */ picklist(NOTION_PROPERTY_TYPES);
/**
* Property types currently supported by the custom-block data source sort API.
* Keep this list narrower than {@link NOTION_PROPERTY_TYPES} when a property
* type is exposed but its sort value is not yet represented by every host.
*/
var CUSTOM_BLOCK_DATA_SOURCE_SORTABLE_PROPERTY_TYPES = [
	"title",
	"rich_text",
	"number",
	"checkbox",
	"url",
	"email",
	"phone_number",
	"date",
	"created_time",
	"last_edited_time"
];
/**
* Per-property schema as exposed by the host over the custom-block bridge.
* The `type` discriminator must be one of {@link NOTION_PROPERTY_TYPES}.
*/
var notionPropertySchemaSchema = /* @__PURE__ */ variant("type", [
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("title")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("rich_text")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("number")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("checkbox")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("url")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("email")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("phone_number")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("select"),
		options: /* @__PURE__ */ array(notionPropertyOptionSchema)
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("multi_select"),
		options: /* @__PURE__ */ array(notionPropertyOptionSchema)
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("status"),
		options: /* @__PURE__ */ array(notionPropertyOptionSchema),
		groups: /* @__PURE__ */ array(notionStatusGroupSchema)
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("date")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("people")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("files")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("unique_id")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("relation"),
		data_source_id: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
		dual_property: /* @__PURE__ */ optional(notionDualPropertySchema)
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("place")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("formula")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("rollup")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("button")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("verification")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("last_visited_time")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("location")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("created_time")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("last_edited_time")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("created_by")
	}),
	/* @__PURE__ */ object({
		...baseProp.entries,
		type: /* @__PURE__ */ literal("last_edited_by")
	})
]);
/**
* The four synthetic built-in property IDs the host always includes in every
* data source's `propertySchemasById` and every row's `propertiesById`.
*/
var NOTION_BUILTIN_PROPERTY_IDS = [
	"created_time",
	"last_edited_time",
	"created_by",
	"last_edited_by"
];
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/contrast.js
var notionContrastModeSchema = /* @__PURE__ */ picklist(["standard", "high"]);
var DEFAULT_CONTRAST_MODE = "standard";
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/ids.js
/**
* Branded Notion block ID. Host payloads and SDK APIs use plain strings at runtime,
* but the brand keeps block IDs from being accidentally mixed with other IDs in TypeScript.
*/
var notionBlockIdSchema = /* @__PURE__ */ pipe(/* @__PURE__ */ string(), /* @__PURE__ */ brand("NotionBlockId"));
/**
* Branded Notion data source ID. Host payloads and SDK APIs use plain strings at runtime,
* but the brand keeps data source IDs from being accidentally mixed with other IDs in TypeScript.
*/
var notionDataSourceIdSchema = /* @__PURE__ */ pipe(/* @__PURE__ */ string(), /* @__PURE__ */ brand("NotionDataSourceId"));
/**
* Branded Notion page ID. Host payloads and SDK APIs use plain strings at runtime,
* but the brand keeps page IDs from being accidentally mixed with other IDs in TypeScript.
*/
var notionPageIdSchema = /* @__PURE__ */ pipe(/* @__PURE__ */ string(), /* @__PURE__ */ brand("NotionPageId"));
/**
* Branded Notion agent ID. Agent parents identify the workflow that owns an
* instruction page or one of its blocks.
*/
var notionAgentIdSchema = /* @__PURE__ */ pipe(/* @__PURE__ */ string(), /* @__PURE__ */ brand("NotionAgentId"));
var notionDataSourceBindingsSchema = /* @__PURE__ */ record(/* @__PURE__ */ string(), /* @__PURE__ */ object({
	collectionPointer: /* @__PURE__ */ optional(/* @__PURE__ */ object({
		id: notionDataSourceIdSchema,
		table: /* @__PURE__ */ string(),
		spaceId: /* @__PURE__ */ optional(/* @__PURE__ */ pipe(/* @__PURE__ */ string(), /* @__PURE__ */ brand("NotionSpaceId")))
	})),
	collectionSchema: /* @__PURE__ */ optional(/* @__PURE__ */ object({
		id: /* @__PURE__ */ optional(notionDataSourceIdSchema),
		propertiesById: /* @__PURE__ */ record(/* @__PURE__ */ string(), notionPropertySchemaSchema)
	})),
	propertyIdsByKey: /* @__PURE__ */ optional(/* @__PURE__ */ record(/* @__PURE__ */ string(), /* @__PURE__ */ optional(/* @__PURE__ */ string())))
}));
var manifestSchema = /* @__PURE__ */ object({
	version: /* @__PURE__ */ literal(1),
	dataSources: /* @__PURE__ */ record(/* @__PURE__ */ string(), /* @__PURE__ */ object({
		name: /* @__PURE__ */ string(),
		description: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
		icon: /* @__PURE__ */ optional(/* @__PURE__ */ variant("type", [/* @__PURE__ */ object({
			type: /* @__PURE__ */ literal("emoji"),
			emoji: /* @__PURE__ */ string()
		}), /* @__PURE__ */ object({
			type: /* @__PURE__ */ literal("external"),
			url: /* @__PURE__ */ string()
		})])),
		properties: /* @__PURE__ */ optional(/* @__PURE__ */ record(/* @__PURE__ */ string(), /* @__PURE__ */ object({
			name: /* @__PURE__ */ string(),
			description: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
			type: notionPropertyTypeSchema
		})), {})
	}))
});
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/parent.js
var notionParentSchema = /* @__PURE__ */ variant("type", [
	/* @__PURE__ */ object({
		type: /* @__PURE__ */ literal("page_id"),
		page_id: notionPageIdSchema
	}),
	/* @__PURE__ */ object({
		type: /* @__PURE__ */ literal("data_source_id"),
		data_source_id: notionDataSourceIdSchema
	}),
	/* @__PURE__ */ object({
		type: /* @__PURE__ */ literal("workspace"),
		workspace: /* @__PURE__ */ literal(true)
	}),
	/* @__PURE__ */ object({
		type: /* @__PURE__ */ literal("block_id"),
		block_id: notionBlockIdSchema
	}),
	/* @__PURE__ */ object({
		type: /* @__PURE__ */ literal("agent_id"),
		agent_id: notionAgentIdSchema
	}),
	/* @__PURE__ */ object({ type: /* @__PURE__ */ literal("unavailable") })
]);
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/pages/page.js
/**
* Notion page shapes exchanged over the custom block bridge.
*
* These mirror a narrow subset of Notion's public `POST /v1/pages` API, since that's the bridge
* shape the host delivers for messages like `createPageResult`.
*/
/**
* The custom block's nearest enclosing page ancestor, carried in `init.page` and `pageChanged`.
*/
var customBlockPageSchema = /* @__PURE__ */ object({
	id: notionPageIdSchema,
	/**
	* The containing page's own parent. It lets a block distinguish a freestanding page from a
	* database row without a round trip. Not to be confused with the top-level `parent` runtime
	* value, which is the custom block's own parent.
	*/
	parent: notionParentSchema
});
var notionEmojiIconSchema = /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("emoji"),
	emoji: /* @__PURE__ */ string()
});
var notionCustomEmojiIconSchema = /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("custom_emoji"),
	custom_emoji: /* @__PURE__ */ object({
		id: /* @__PURE__ */ string(),
		name: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
		url: /* @__PURE__ */ optional(/* @__PURE__ */ string())
	})
});
var notionExternalFileSchema = /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("external"),
	external: /* @__PURE__ */ object({ url: /* @__PURE__ */ string() })
});
var notionHostedFileSchema = /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("file"),
	file: /* @__PURE__ */ object({
		url: /* @__PURE__ */ string(),
		expiry_time: /* @__PURE__ */ optional(/* @__PURE__ */ string())
	})
});
var notionPageIconSchema = /* @__PURE__ */ variant("type", [
	notionEmojiIconSchema,
	notionCustomEmojiIconSchema,
	notionExternalFileSchema,
	notionHostedFileSchema
]);
var notionPageCoverSchema = /* @__PURE__ */ variant("type", [notionExternalFileSchema, notionHostedFileSchema]);
var nullableStringSchema = /* @__PURE__ */ nullable(/* @__PURE__ */ string());
var notionRichTextItemSchema = /* @__PURE__ */ record(/* @__PURE__ */ string(), /* @__PURE__ */ unknown());
var notionSelectOptionInputSchema = /* @__PURE__ */ union([/* @__PURE__ */ object({
	id: /* @__PURE__ */ string(),
	name: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
	color: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
	description: /* @__PURE__ */ optional(nullableStringSchema)
}), /* @__PURE__ */ object({
	name: /* @__PURE__ */ string(),
	id: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
	color: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
	description: /* @__PURE__ */ optional(nullableStringSchema)
})]);
var notionDateInputSchema = /* @__PURE__ */ object({
	start: /* @__PURE__ */ string(),
	end: /* @__PURE__ */ optional(nullableStringSchema),
	time_zone: /* @__PURE__ */ optional(nullableStringSchema)
});
var notionUserInputSchema = /* @__PURE__ */ union([/* @__PURE__ */ object({
	object: /* @__PURE__ */ optional(/* @__PURE__ */ literal("user")),
	id: /* @__PURE__ */ string()
}), /* @__PURE__ */ object({
	object: /* @__PURE__ */ literal("group"),
	id: /* @__PURE__ */ string(),
	name: /* @__PURE__ */ optional(nullableStringSchema)
})]);
var notionRelationInputSchema = /* @__PURE__ */ object({ id: /* @__PURE__ */ string() });
var notionFileInputSchema = /* @__PURE__ */ union([/* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("external"),
	name: /* @__PURE__ */ string(),
	external: /* @__PURE__ */ object({ url: /* @__PURE__ */ string() })
}), /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("file"),
	name: /* @__PURE__ */ string(),
	file: /* @__PURE__ */ object({
		url: /* @__PURE__ */ string(),
		expiry_time: /* @__PURE__ */ optional(/* @__PURE__ */ string())
	})
})]);
var notionPlaceInputSchema = /* @__PURE__ */ object({
	lat: /* @__PURE__ */ number(),
	lon: /* @__PURE__ */ number(),
	name: /* @__PURE__ */ optional(nullableStringSchema),
	address: /* @__PURE__ */ optional(nullableStringSchema),
	aws_place_id: /* @__PURE__ */ optional(nullableStringSchema),
	google_place_id: /* @__PURE__ */ optional(nullableStringSchema)
});
var pagePropertyBaseSchema = { id: /* @__PURE__ */ string() };
/**
* A page property value.
*/
var notionPagePropertyValueSchema = /* @__PURE__ */ variant("type", [
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("title"),
		title: /* @__PURE__ */ array(notionRichTextItemSchema)
	}),
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("rich_text"),
		rich_text: /* @__PURE__ */ array(notionRichTextItemSchema)
	}),
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("number"),
		number: /* @__PURE__ */ nullable(/* @__PURE__ */ number())
	}),
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("url"),
		url: nullableStringSchema
	}),
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("email"),
		email: nullableStringSchema
	}),
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("phone_number"),
		phone_number: nullableStringSchema
	}),
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("checkbox"),
		checkbox: /* @__PURE__ */ boolean()
	}),
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("select"),
		select: /* @__PURE__ */ nullable(notionSelectOptionInputSchema)
	}),
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("status"),
		status: /* @__PURE__ */ nullable(notionSelectOptionInputSchema)
	}),
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("multi_select"),
		multi_select: /* @__PURE__ */ array(notionSelectOptionInputSchema)
	}),
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("date"),
		date: /* @__PURE__ */ nullable(notionDateInputSchema)
	}),
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("people"),
		people: /* @__PURE__ */ array(notionUserInputSchema)
	}),
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("relation"),
		has_more: /* @__PURE__ */ optional(/* @__PURE__ */ boolean()),
		relation: /* @__PURE__ */ array(notionRelationInputSchema)
	}),
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("files"),
		files: /* @__PURE__ */ array(notionFileInputSchema)
	}),
	/* @__PURE__ */ object({
		...pagePropertyBaseSchema,
		type: /* @__PURE__ */ literal("place"),
		place: /* @__PURE__ */ nullable(notionPlaceInputSchema)
	})
]);
/**
* The `Page` object returned in `createPageResult` messages.
*/
var notionPageSchema = /* @__PURE__ */ object({
	object: /* @__PURE__ */ literal("page"),
	id: notionPageIdSchema,
	parent: notionParentSchema,
	properties: /* @__PURE__ */ record(/* @__PURE__ */ string(), notionPagePropertyValueSchema),
	created_time: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
	last_edited_time: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
	icon: /* @__PURE__ */ optional(notionPageIconSchema),
	cover: /* @__PURE__ */ optional(notionPageCoverSchema),
	url: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
	public_url: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
	/** Whether the page or an ancestor is archived. */
	is_archived: /* @__PURE__ */ optional(/* @__PURE__ */ boolean()),
	/** Whether the page or an ancestor is in Trash. */
	in_trash: /* @__PURE__ */ optional(/* @__PURE__ */ boolean())
});
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/theme.js
var notionThemeSchema = /* @__PURE__ */ picklist(["light", "dark"]);
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/users/user.js
var notionUserIdSchema = /* @__PURE__ */ pipe(/* @__PURE__ */ string(), /* @__PURE__ */ brand("NotionUserId"));
var notionUserSchema = /* @__PURE__ */ object({
	object: /* @__PURE__ */ literal("user"),
	id: notionUserIdSchema,
	name: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
	avatar_url: /* @__PURE__ */ nullable(/* @__PURE__ */ string()),
	type: /* @__PURE__ */ literal("person"),
	person: /* @__PURE__ */ object({ email: /* @__PURE__ */ string() })
});
var notionUserListSchema = /* @__PURE__ */ object({
	object: /* @__PURE__ */ literal("list"),
	results: /* @__PURE__ */ array(notionUserSchema),
	next_cursor: /* @__PURE__ */ nullable(/* @__PURE__ */ string()),
	has_more: /* @__PURE__ */ boolean(),
	type: /* @__PURE__ */ literal("user"),
	user: /* @__PURE__ */ record(/* @__PURE__ */ string(), /* @__PURE__ */ unknown())
});
var customBlockInitErrorInfoSchema = /* @__PURE__ */ object({
	code: /* @__PURE__ */ string(),
	message: /* @__PURE__ */ string(),
	isRetryable: /* @__PURE__ */ boolean()
});
var CustomBlockInitializationError = class extends Error {
	constructor(error) {
		super(error.message);
		this.name = "CustomBlockInitializationError";
		this.code = error.code;
		this.isRetryable = error.isRetryable;
	}
	code;
	isRetryable;
};
/**
* Initialization message sent by the host to the sandbox exactly once, in response to the
* sandbox's `connect` message. The sandbox echoes `initializationId` in `initResult`. After
* successful initialization, live updates flow through narrower messages
* (`themeChanged`, `contrastModeChanged`, `parentChanged`, `pageChanged`,
* `dataSourcesChanged`).
*/
var initMessageSchema = /* @__PURE__ */ variant("status", [/* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("init"),
	initializationId: /* @__PURE__ */ string(),
	status: /* @__PURE__ */ literal("success"),
	theme: notionThemeSchema,
	contrastMode: /* @__PURE__ */ optional(notionContrastModeSchema, DEFAULT_CONTRAST_MODE),
	blockId: notionBlockIdSchema,
	parent: notionParentSchema,
	page: customBlockPageSchema,
	manifest: manifestSchema,
	dataSources: /* @__PURE__ */ object({ bindings: notionDataSourceBindingsSchema }),
	currentUser: notionUserSchema
}), /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("init"),
	initializationId: /* @__PURE__ */ string(),
	status: /* @__PURE__ */ literal("error"),
	error: customBlockInitErrorInfoSchema
})]);
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/bridge/hostState.js
function createEmptyDataSourceQueryState(dataSourceKey) {
	return {
		dataSourceKey,
		items: [],
		isLoading: false,
		hasMore: false
	};
}
var EMPTY_QUERY_VIEW = {
	items: [],
	propertySchemasById: {},
	propertyIdsByKey: {},
	propertySchemasByKey: {},
	isLoading: false,
	hasMore: false
};
function getDataSourceQueryView(hostState, key, subscriptionId, updateDataSourcePage) {
	if (hostState.status !== "initialized") return EMPTY_QUERY_VIEW;
	const dataSource = hostState.dataSources.find((entry) => entry.key === key);
	const subscriptionState = hostState.dataSourceState[subscriptionId];
	const queryState = subscriptionState?.dataSourceKey === key ? subscriptionState : createEmptyDataSourceQueryState(key);
	if (dataSource === void 0) return {
		items: [],
		collectionSchema: void 0,
		propertySchemasById: {},
		propertyIdsByKey: {},
		propertySchemasByKey: {},
		isLoading: queryState.isLoading,
		hasMore: queryState.hasMore,
		error: queryState.error
	};
	const propertyIdsByKey = dataSource.propertyIdsByKey;
	const propertySchemasById = dataSource.propertySchemasById;
	const resolvedItems = queryState.items.map((entry) => {
		const propertiesByKey = {};
		for (const [key, propertyId] of Object.entries(propertyIdsByKey)) propertiesByKey[key] = propertyId === void 0 ? void 0 : entry.propertiesById[propertyId];
		const update = (args) => updateDataSourcePage({
			dataSource,
			pageId: entry.id,
			pageUpdateArgs: args
		});
		return {
			id: entry.id,
			is_archived: entry.is_archived,
			in_trash: entry.in_trash,
			propertiesById: entry.propertiesById,
			propertiesByKey,
			update,
			archive: () => update({ is_archived: true }),
			unarchive: () => update({ is_archived: false })
		};
	});
	const propertySchemasByKey = {};
	for (const [key, propertyId] of Object.entries(propertyIdsByKey)) propertySchemasByKey[key] = propertyId === void 0 ? void 0 : propertySchemasById[propertyId];
	return {
		items: resolvedItems,
		collectionSchema: dataSource.collectionSchema,
		propertySchemasById,
		propertyIdsByKey,
		propertySchemasByKey,
		isLoading: queryState.isLoading,
		hasMore: queryState.hasMore,
		error: queryState.error
	};
}
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/messages/contrastModeChanged.js
/** Message sent by the host when contrast changes after initialization. */
var contrastModeChangedMessageSchema = /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("contrastModeChanged"),
	contrastMode: notionContrastModeSchema
});
/**
* Message sent by the host in response to a sandbox `createPage` request.
*/
var createPageResultMessageSchema = /* @__PURE__ */ variant("status", [/* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("createPageResult"),
	requestId: /* @__PURE__ */ string(),
	status: /* @__PURE__ */ literal("success"),
	/** The newly created page. */
	page: notionPageSchema
}), /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("createPageResult"),
	requestId: /* @__PURE__ */ string(),
	status: /* @__PURE__ */ literal("error"),
	error: /* @__PURE__ */ object({
		code: /* @__PURE__ */ string(),
		message: /* @__PURE__ */ string(),
		isRetryable: /* @__PURE__ */ boolean()
	})
})]);
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/messages/currentUserChanged.js
/**
* Sent by the host when the viewing user's profile changes while the block is mounted.
*/
var currentUserChangedMessageSchema = /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("currentUserChanged"),
	currentUser: notionUserSchema
});
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/messages/dataSourcesChanged.js
/**
* Message sent by the host whenever the custom block's data source mapping changes (e.g. a key is
* added, removed, or remapped). The SDK replaces its list of configured data sources but keeps any
* in-flight `useDataSource` query state for keys that still exist.
*/
var dataSourcesChangedMessageSchema = /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("dataSourcesChanged"),
	dataSources: /* @__PURE__ */ object({ bindings: notionDataSourceBindingsSchema })
});
var getPageResultMessageSchema = /* @__PURE__ */ variant("status", [/* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("getPageResult"),
	requestId: /* @__PURE__ */ string(),
	status: /* @__PURE__ */ literal("success"),
	page: notionPageSchema
}), /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("getPageResult"),
	requestId: /* @__PURE__ */ string(),
	status: /* @__PURE__ */ literal("error"),
	error: /* @__PURE__ */ object({
		code: /* @__PURE__ */ string(),
		message: /* @__PURE__ */ string(),
		isRetryable: /* @__PURE__ */ boolean()
	})
})]);
var getUserResultMessageSchema = /* @__PURE__ */ variant("status", [/* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("getUserResult"),
	requestId: /* @__PURE__ */ string(),
	status: /* @__PURE__ */ literal("success"),
	user: notionUserSchema
}), /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("getUserResult"),
	requestId: /* @__PURE__ */ string(),
	status: /* @__PURE__ */ literal("error"),
	error: /* @__PURE__ */ object({
		code: /* @__PURE__ */ string(),
		message: /* @__PURE__ */ string(),
		isRetryable: /* @__PURE__ */ boolean()
	})
})]);
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/messages/invalidSandboxMessage.js
/**
* Sent by the host back to the sandbox when an inbound sandbox-to-host message could not be parsed
* (unknown `type`, schema mismatch, etc.). The sandbox should never reply to an
* `invalidSandboxMessage` with another bridge error message.
*/
var invalidSandboxMessageSchema = /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("invalidSandboxMessage"),
	/**
	* A human-readable string intended for sandbox-side logging. It has no structured contract.
	*/
	reason: /* @__PURE__ */ string()
});
var listUsersResultMessageSchema = /* @__PURE__ */ variant("status", [/* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("listUsersResult"),
	requestId: /* @__PURE__ */ string(),
	status: /* @__PURE__ */ literal("success"),
	list: notionUserListSchema
}), /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("listUsersResult"),
	requestId: /* @__PURE__ */ string(),
	status: /* @__PURE__ */ literal("error"),
	error: /* @__PURE__ */ object({
		code: /* @__PURE__ */ string(),
		message: /* @__PURE__ */ string(),
		isRetryable: /* @__PURE__ */ boolean()
	})
})]);
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/messages/pageChanged.js
/**
* Message sent by the host whenever the custom block's nearest page ancestor changes.
*/
var pageChangedMessageSchema = /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("pageChanged"),
	page: customBlockPageSchema
});
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/messages/parentChanged.js
/**
* Message sent by the host whenever the custom block's parent changes.
*/
var parentChangedMessageSchema = /* @__PURE__ */ object({
	type: /* @__PURE__ */ literal("parentChanged"),
	parent: notionParentSchema
});
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/dataSources/dateValue.js
var notionDateReminderSchema = /* @__PURE__ */ object({
	unit: /* @__PURE__ */ picklist([
		"year",
		"month",
		"week",
		"day"
	]),
	value: /* @__PURE__ */ number(),
	time: /* @__PURE__ */ string(),
	defaultTimeZone: /* @__PURE__ */ optional(/* @__PURE__ */ string())
});
var notionTimeReminderSchema = /* @__PURE__ */ object({
	unit: /* @__PURE__ */ picklist(["hour", "minute"]),
	value: /* @__PURE__ */ number()
});
var notionNoReminderSchema = /* @__PURE__ */ object({ unit: /* @__PURE__ */ literal("none") });
/**
* Possible types for a Notion `datetime` reminder.
*/
var notionDateTimeReminderSchema = /* @__PURE__ */ union([notionDateReminderSchema, notionTimeReminderSchema]);
var dateOrNoReminder = /* @__PURE__ */ optional(/* @__PURE__ */ union([notionDateReminderSchema, notionNoReminderSchema]));
var dateTimeOrNoReminder = /* @__PURE__ */ optional(/* @__PURE__ */ union([notionDateTimeReminderSchema, notionNoReminderSchema]));
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/messages/hostToSandbox.js
/**
* Discriminated union of every message the host is allowed to send the sandbox.
*/
var hostToSandboxMessageSchema = /* @__PURE__ */ variant("type", [
	initMessageSchema,
	/* @__PURE__ */ object({
		type: /* @__PURE__ */ literal("themeChanged"),
		theme: notionThemeSchema
	}),
	contrastModeChangedMessageSchema,
	parentChangedMessageSchema,
	pageChangedMessageSchema,
	currentUserChangedMessageSchema,
	dataSourcesChangedMessageSchema,
	/* @__PURE__ */ variant("status", [/* @__PURE__ */ object({
		type: /* @__PURE__ */ literal("queryDataSourceResult"),
		subscriptionId: /* @__PURE__ */ string(),
		status: /* @__PURE__ */ literal("success"),
		items: /* @__PURE__ */ array(/* @__PURE__ */ object({
			id: notionPageIdSchema,
			/** Whether the page or an ancestor is archived. */
			is_archived: /* @__PURE__ */ optional(/* @__PURE__ */ boolean()),
			/** Whether the page or an ancestor is in Trash. */
			in_trash: /* @__PURE__ */ optional(/* @__PURE__ */ boolean()),
			propertiesById: /* @__PURE__ */ record(/* @__PURE__ */ string(), /* @__PURE__ */ optional(/* @__PURE__ */ union([
				/* @__PURE__ */ string(),
				/* @__PURE__ */ number(),
				/* @__PURE__ */ boolean(),
				/* @__PURE__ */ variant("type", [
					/* @__PURE__ */ object({
						type: /* @__PURE__ */ literal("date"),
						start_date: /* @__PURE__ */ string(),
						reminder: dateOrNoReminder
					}),
					/* @__PURE__ */ object({
						type: /* @__PURE__ */ literal("daterange"),
						start_date: /* @__PURE__ */ string(),
						end_date: /* @__PURE__ */ string(),
						reminder: dateOrNoReminder
					}),
					/* @__PURE__ */ object({
						type: /* @__PURE__ */ literal("datetime"),
						start_date: /* @__PURE__ */ string(),
						start_time: /* @__PURE__ */ string(),
						time_zone: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
						reminder: dateTimeOrNoReminder
					}),
					/* @__PURE__ */ object({
						type: /* @__PURE__ */ literal("datetimerange"),
						start_date: /* @__PURE__ */ string(),
						start_time: /* @__PURE__ */ string(),
						end_date: /* @__PURE__ */ string(),
						end_time: /* @__PURE__ */ string(),
						time_zone: /* @__PURE__ */ optional(/* @__PURE__ */ string()),
						reminder: dateTimeOrNoReminder
					})
				]),
				/* @__PURE__ */ array(/* @__PURE__ */ string()),
				/* @__PURE__ */ array(/* @__PURE__ */ object({
					id: /* @__PURE__ */ string(),
					table: /* @__PURE__ */ string()
				}))
			])))
		})),
		hasMore: /* @__PURE__ */ boolean()
	}), /* @__PURE__ */ object({
		type: /* @__PURE__ */ literal("queryDataSourceResult"),
		subscriptionId: /* @__PURE__ */ string(),
		status: /* @__PURE__ */ literal("error"),
		error: /* @__PURE__ */ object({
			code: /* @__PURE__ */ string(),
			message: /* @__PURE__ */ string(),
			isRetryable: /* @__PURE__ */ boolean()
		})
	})]),
	createPageResultMessageSchema,
	getPageResultMessageSchema,
	getUserResultMessageSchema,
	listUsersResultMessageSchema,
	/* @__PURE__ */ variant("status", [/* @__PURE__ */ object({
		type: /* @__PURE__ */ literal("updatePageResult"),
		requestId: /* @__PURE__ */ string(),
		status: /* @__PURE__ */ literal("success"),
		page: notionPageSchema
	}), /* @__PURE__ */ object({
		type: /* @__PURE__ */ literal("updatePageResult"),
		requestId: /* @__PURE__ */ string(),
		status: /* @__PURE__ */ literal("error"),
		error: /* @__PURE__ */ object({
			code: /* @__PURE__ */ string(),
			message: /* @__PURE__ */ string(),
			isRetryable: /* @__PURE__ */ boolean()
		})
	})]),
	invalidSandboxMessageSchema
]);
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/messages/incomingType.js
/**
* Reads the `type` field off an inbound bridge message, if any.
*
* Used by both sides of the bridge after the canonical message schema rejects a payload. We still
* want to know what type the sender claimed to be sending so we can (a) avoid NACK loops on
* `invalidHostMessage` / `invalidSandboxMessage` and (b) include the type in the failure reason
* for debugging.
*/
function readIncomingType(data) {
	if (typeof data === "object" && data !== null && "type" in data && typeof data.type === "string") return data.type;
}
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/utils.js
/**
* Internal helpers shared across the SDK.
*/
/**
* Throws an error when an unexpected value is encountered. This is used to ensure all code paths
* are covered when using discriminated unions.
*/
function unreachable(value) {
	throw new Error(`[custom-blocks-sdk] Unexpected value encountered: ${JSON.stringify(value)}`);
}
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/version.js
/**
* Runtime SDK package version. Sent over the bridge for host-side analytics only.
* Business logic should compare against the bridge protocol version instead of this value.
*
* WARNING: Generated during SDK publish. Do not edit in the published package.
*/
var CUSTOM_BLOCKS_SDK_VERSION = "0.1.49";
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/bridge/appearance.js
/**
* Background color values used before the NDS token scope mounts.
*
* The light value matches NDS's semantic `--bg-base` token in light mode
* (`--gray-0`, white). The dark value is the existing SDK fallback canvas
* color; it is not an exact current generated NDS value. Current NDS maps
* dark `--bg-base` to `--gray-145` (approximately `#1b1b1b`), while the
* legacy notion-next gray surface is `rgba(32, 32, 32, 1)`.
*
* Keep the resolved values here because the document must be styled before the block's NDS
* stylesheet and token scope are guaranteed to be available.
*/
var NOTION_DARK_BACKGROUND_BASE = "#191918";
var NOTION_LIGHT_BACKGROUND_BASE = "#ffffff";
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/protocol/messages/queryDataSource.js
var emptyOperatorSchema = /* @__PURE__ */ union([/* @__PURE__ */ object({ is_empty: /* @__PURE__ */ literal(true) }), /* @__PURE__ */ object({ is_not_empty: /* @__PURE__ */ literal(true) })]);
var stringOrStringArraySchema = /* @__PURE__ */ union([/* @__PURE__ */ string(), /* @__PURE__ */ array(/* @__PURE__ */ string())]);
var customBlockTextFilterOperatorSchema = /* @__PURE__ */ union([
	/* @__PURE__ */ object({ equals: /* @__PURE__ */ string() }),
	/* @__PURE__ */ object({ does_not_equal: /* @__PURE__ */ string() }),
	/* @__PURE__ */ object({ contains: /* @__PURE__ */ string() }),
	/* @__PURE__ */ object({ does_not_contain: /* @__PURE__ */ string() }),
	/* @__PURE__ */ object({ starts_with: /* @__PURE__ */ string() }),
	/* @__PURE__ */ object({ ends_with: /* @__PURE__ */ string() }),
	emptyOperatorSchema
]);
var customBlockNumberFilterOperatorSchema = /* @__PURE__ */ union([
	/* @__PURE__ */ object({ equals: /* @__PURE__ */ number() }),
	/* @__PURE__ */ object({ does_not_equal: /* @__PURE__ */ number() }),
	/* @__PURE__ */ object({ greater_than: /* @__PURE__ */ number() }),
	/* @__PURE__ */ object({ less_than: /* @__PURE__ */ number() }),
	/* @__PURE__ */ object({ greater_than_or_equal_to: /* @__PURE__ */ number() }),
	/* @__PURE__ */ object({ less_than_or_equal_to: /* @__PURE__ */ number() }),
	emptyOperatorSchema
]);
var customBlockCheckboxFilterOperatorSchema = /* @__PURE__ */ union([/* @__PURE__ */ object({ equals: /* @__PURE__ */ boolean() }), /* @__PURE__ */ object({ does_not_equal: /* @__PURE__ */ boolean() })]);
var customBlockOptionFilterOperatorSchema = /* @__PURE__ */ union([
	/* @__PURE__ */ object({ equals: stringOrStringArraySchema }),
	/* @__PURE__ */ object({ does_not_equal: stringOrStringArraySchema }),
	emptyOperatorSchema
]);
var customBlockContainsFilterOperatorSchema = /* @__PURE__ */ union([
	/* @__PURE__ */ object({ contains: stringOrStringArraySchema }),
	/* @__PURE__ */ object({ contains_all: stringOrStringArraySchema }),
	/* @__PURE__ */ object({ does_not_contain: stringOrStringArraySchema }),
	emptyOperatorSchema
]);
var customBlockDateFilterOperatorSchema = /* @__PURE__ */ union([
	/* @__PURE__ */ object({ equals: /* @__PURE__ */ string() }),
	/* @__PURE__ */ object({ before: /* @__PURE__ */ string() }),
	/* @__PURE__ */ object({ after: /* @__PURE__ */ string() }),
	/* @__PURE__ */ object({ on_or_before: /* @__PURE__ */ string() }),
	/* @__PURE__ */ object({ on_or_after: /* @__PURE__ */ string() }),
	emptyOperatorSchema
]);
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/bridge/dataSources/query.js
var DEFAULT_DATA_SOURCE_QUERY_LIMIT = 20;
var MAX_DATA_SOURCE_QUERY_LIMIT = 999;
var MAX_DATA_SOURCE_QUERY_FILTER_CHILDREN = 25;
var supportedDataSourceSortPropertyTypes = new Set(CUSTOM_BLOCK_DATA_SOURCE_SORTABLE_PROPERTY_TYPES);
function resolveDataSourceQuery(args) {
	const { dataSources, key, options, warn } = args;
	const resolvedOptions = resolveDataSourceQueryOptions(options);
	if (resolvedOptions.status === "error") return resolvedOptions;
	const queryOptions = resolvedOptions.options;
	const dataSource = dataSources.find((entry) => entry.key === key);
	if (dataSource === void 0) return {
		status: "error",
		error: `Unknown data source key "${key}". Known keys: [${dataSources.map((entry) => entry.key).join(", ")}].`
	};
	if (dataSource.collectionPointer === void 0) return {
		status: "error",
		error: `Data source "${key}" has not been mapped to a database yet.`
	};
	const limit = resolveDataSourceQueryLimit(queryOptions?.limit, warn);
	if (limit.status === "error") return limit;
	const filter = resolveFilter(queryOptions?.filter, dataSource);
	if (filter.status === "error") return filter;
	const sorts = resolveSorts(queryOptions?.sorts, dataSource);
	if (sorts.status === "error") return sorts;
	const identity = stableJsonStringify({
		dataSourceId: dataSource.collectionPointer.id,
		limit: limit.limit,
		filter: filter.filter ?? null,
		sorts: sorts.sorts ?? []
	});
	return {
		status: "ok",
		dataSource,
		query: {
			dataSourceId: dataSource.collectionPointer.id,
			limit: limit.limit,
			filter: filter.filter,
			sorts: sorts.sorts,
			identity
		}
	};
}
function resolveDataSourceQueryOptions(options) {
	if (options === void 0) return { status: "ok" };
	if (typeof options !== "object" || options === null || Array.isArray(options)) return {
		status: "error",
		error: "Data source query options must be an object."
	};
	const prototype = Object.getPrototypeOf(options);
	if (prototype !== Object.prototype && prototype !== null) return {
		status: "error",
		error: "Data source query options must be an object."
	};
	const optionsObject = options;
	if (Object.keys(optionsObject).some((key) => ![
		"limit",
		"filter",
		"sorts"
	].includes(key))) return {
		status: "error",
		error: "Data source query options contain unsupported fields."
	};
	return {
		status: "ok",
		options: {
			limit: Object.hasOwn(optionsObject, "limit") ? optionsObject.limit : void 0,
			filter: Object.hasOwn(optionsObject, "filter") ? optionsObject.filter : void 0,
			sorts: Object.hasOwn(optionsObject, "sorts") ? optionsObject.sorts : void 0
		}
	};
}
function resolveDataSourceQueryLimit(limit, warn = console.warn) {
	if (limit === void 0) return {
		status: "ok",
		limit: DEFAULT_DATA_SOURCE_QUERY_LIMIT
	};
	if (typeof limit !== "number" || !Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1) return {
		status: "error",
		error: `Data source query limit must be a positive integer between 1 and ${MAX_DATA_SOURCE_QUERY_LIMIT}.`
	};
	if (limit > MAX_DATA_SOURCE_QUERY_LIMIT) {
		warn?.(`Data source query limit ${limit} exceeds the maximum of ${MAX_DATA_SOURCE_QUERY_LIMIT}; clamping to ${MAX_DATA_SOURCE_QUERY_LIMIT}.`);
		return {
			status: "ok",
			limit: MAX_DATA_SOURCE_QUERY_LIMIT
		};
	}
	return {
		status: "ok",
		limit
	};
}
function getDataSourceQueryOptionsIdentity(options) {
	try {
		return stableJsonStringify(options ?? {});
	} catch {
		return "invalid-data-source-query-options";
	}
}
function stableJsonStringify(value) {
	return JSON.stringify(normalizeJsonValue(value));
}
function resolveFilter(filter, dataSource) {
	if (filter === void 0) return { status: "ok" };
	if (typeof filter !== "object" || filter === null || Array.isArray(filter)) return {
		status: "error",
		error: "Data source query filter must be an object."
	};
	const filterObject = filter;
	if (Object.hasOwn(filterObject, "and")) {
		if (Object.keys(filterObject).length !== 1 || !Array.isArray(filterObject.and)) return {
			status: "error",
			error: "Data source query filter \"and\" must be an array."
		};
		if (filterObject.and.length > MAX_DATA_SOURCE_QUERY_FILTER_CHILDREN) return {
			status: "error",
			error: `Data source query filter "and" may contain at most ${MAX_DATA_SOURCE_QUERY_FILTER_CHILDREN} children.`
		};
		const and = [];
		for (const child of filterObject.and) {
			const resolved = resolvePropertyFilter(child, dataSource);
			if (resolved.status === "error") return resolved;
			and.push(resolved.filter);
		}
		return {
			status: "ok",
			filter: { and }
		};
	}
	return resolvePropertyFilter(filterObject, dataSource);
}
function resolveSorts(sorts, dataSource) {
	if (sorts === void 0) return { status: "ok" };
	if (!Array.isArray(sorts)) return {
		status: "error",
		error: "Data source query sorts must be an array."
	};
	if (sorts.length === 0) return { status: "ok" };
	if (sorts.length > 10) return {
		status: "error",
		error: `Data source query sorts may contain at most 10 entries.`
	};
	const resolvedSorts = [];
	const seenPropertyIds = /* @__PURE__ */ new Set();
	for (const sort of sorts) {
		const resolved = resolveSort(sort, dataSource);
		if (resolved.status === "error") return resolved;
		if (seenPropertyIds.has(resolved.sort.propertyId)) return {
			status: "error",
			error: `Data source query sorts cannot contain duplicate property ID "${resolved.sort.propertyId}".`
		};
		seenPropertyIds.add(resolved.sort.propertyId);
		resolvedSorts.push(resolved.sort);
	}
	return {
		status: "ok",
		sorts: resolvedSorts
	};
}
function resolveSort(sort, dataSource) {
	if (typeof sort !== "object" || sort === null || Array.isArray(sort)) return {
		status: "error",
		error: "Data source query sort must be an object."
	};
	const sortObject = sort;
	if (Object.keys(sortObject).some((key) => ![
		"key",
		"propertyId",
		"direction"
	].includes(key))) return {
		status: "error",
		error: "Data source query sort contains unsupported fields."
	};
	const property = resolvePropertyAddress(sortObject, dataSource);
	if (property.status === "error") return property;
	if (!supportedDataSourceSortPropertyTypes.has(property.propertyType)) return {
		status: "error",
		error: `Data source query sorts do not yet support property type "${property.propertyType}".`
	};
	const direction = sortObject.direction;
	if (!Object.hasOwn(sortObject, "direction") || direction !== "ascending" && direction !== "descending") return {
		status: "error",
		error: "Data source query sort direction must be \"ascending\" or \"descending\"."
	};
	return {
		status: "ok",
		sort: {
			propertyId: property.propertyId,
			direction
		}
	};
}
function resolvePropertyFilter(filter, dataSource) {
	if (typeof filter !== "object" || filter === null || Array.isArray(filter)) return {
		status: "error",
		error: "Data source query property filter must be an object."
	};
	const filterObject = filter;
	const property = resolvePropertyAddress(filterObject, dataSource);
	if (property.status === "error") return property;
	const branchKeys = Object.keys(filterObject).filter((key) => key !== "key" && key !== "propertyId");
	if (branchKeys.length !== 1) return {
		status: "error",
		error: "Data source query property filter must contain exactly one property branch."
	};
	const branch = branchKeys[0];
	const value = filterObject[branch];
	if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).length !== 1) return invalidOperator(branch);
	if (property.propertyType !== branch) return {
		status: "error",
		error: `Data source query filter branch "${branch}" does not match property type "${property.propertyType}".`
	};
	return resolvePropertyFilterBranch({
		propertyId: property.propertyId,
		branch,
		value
	});
}
function resolvePropertyFilterBranch(args) {
	switch (args.branch) {
		case "title":
		case "rich_text":
		case "url":
		case "email":
		case "phone_number": return resolveTextPropertyFilter({
			propertyId: args.propertyId,
			branch: args.branch,
			value: args.value
		});
		case "number": return resolveNumberPropertyFilter(args.propertyId, args.value);
		case "checkbox": return resolveCheckboxPropertyFilter(args.propertyId, args.value);
		case "select":
		case "status": return resolveOptionPropertyFilter({
			propertyId: args.propertyId,
			branch: args.branch,
			value: args.value
		});
		case "multi_select": return resolveMultiSelectPropertyFilter(args.propertyId, args.value);
		case "date": return resolveDatePropertyFilter(args.propertyId, args.value);
		default: return {
			status: "error",
			error: `Data source query filter branch "${args.branch}" is not supported.`
		};
	}
}
function resolveTextPropertyFilter(args) {
	const parsed = /* @__PURE__ */ safeParse(customBlockTextFilterOperatorSchema, args.value);
	if (!parsed.success) return invalidOperator(args.branch);
	switch (args.branch) {
		case "title": return {
			status: "ok",
			filter: {
				propertyId: args.propertyId,
				title: parsed.output
			}
		};
		case "rich_text": return {
			status: "ok",
			filter: {
				propertyId: args.propertyId,
				rich_text: parsed.output
			}
		};
		case "url": return {
			status: "ok",
			filter: {
				propertyId: args.propertyId,
				url: parsed.output
			}
		};
		case "email": return {
			status: "ok",
			filter: {
				propertyId: args.propertyId,
				email: parsed.output
			}
		};
		case "phone_number": return {
			status: "ok",
			filter: {
				propertyId: args.propertyId,
				phone_number: parsed.output
			}
		};
		default: return unreachable(args.branch);
	}
}
function resolveNumberPropertyFilter(propertyId, value) {
	const parsed = /* @__PURE__ */ safeParse(customBlockNumberFilterOperatorSchema, value);
	if (!parsed.success || !Object.values(parsed.output).every((entry) => typeof entry !== "number" || Number.isFinite(entry))) return invalidOperator("number");
	return {
		status: "ok",
		filter: {
			propertyId,
			number: parsed.output
		}
	};
}
function resolveCheckboxPropertyFilter(propertyId, value) {
	const parsed = /* @__PURE__ */ safeParse(customBlockCheckboxFilterOperatorSchema, value);
	return parsed.success ? {
		status: "ok",
		filter: {
			propertyId,
			checkbox: parsed.output
		}
	} : invalidOperator("checkbox");
}
function resolveOptionPropertyFilter(args) {
	const parsed = /* @__PURE__ */ safeParse(customBlockOptionFilterOperatorSchema, args.value);
	if (!parsed.success) return invalidOperator(args.branch);
	switch (args.branch) {
		case "select": return {
			status: "ok",
			filter: {
				propertyId: args.propertyId,
				select: parsed.output
			}
		};
		case "status": return {
			status: "ok",
			filter: {
				propertyId: args.propertyId,
				status: parsed.output
			}
		};
		default: return unreachable(args.branch);
	}
}
function resolveMultiSelectPropertyFilter(propertyId, value) {
	const parsed = /* @__PURE__ */ safeParse(customBlockContainsFilterOperatorSchema, value);
	return parsed.success ? {
		status: "ok",
		filter: {
			propertyId,
			multi_select: parsed.output
		}
	} : invalidOperator("multi_select");
}
function resolveDatePropertyFilter(propertyId, value) {
	const parsed = /* @__PURE__ */ safeParse(customBlockDateFilterOperatorSchema, value);
	if (!parsed.success || !Object.values(parsed.output).every((entry) => entry === true || isValidIsoDate(entry))) return invalidOperator("date");
	return {
		status: "ok",
		filter: {
			propertyId,
			date: parsed.output
		}
	};
}
function resolvePropertyAddress(value, dataSource) {
	const hasKey = Object.hasOwn(value, "key");
	if (hasKey === Object.hasOwn(value, "propertyId")) return {
		status: "error",
		error: "Data source query filters and sorts must use exactly one of key or propertyId."
	};
	let propertyId;
	if (hasKey) {
		if (typeof value.key !== "string") return {
			status: "error",
			error: "Data source query property key must be a string."
		};
		if (!Object.hasOwn(dataSource.propertyIdsByKey, value.key)) return {
			status: "error",
			error: `Unknown property key "${value.key}" for data source "${dataSource.key}".`
		};
		const resolvedPropertyId = dataSource.propertyIdsByKey[value.key];
		if (resolvedPropertyId === void 0) return {
			status: "error",
			error: `Property key "${value.key}" for data source "${dataSource.key}" is not bound.`
		};
		propertyId = resolvedPropertyId;
	} else {
		if (typeof value.propertyId !== "string") return {
			status: "error",
			error: "Data source query propertyId must be a string."
		};
		propertyId = value.propertyId;
	}
	if (!Object.hasOwn(dataSource.propertySchemasById, propertyId)) return {
		status: "error",
		error: `Unknown property ID "${propertyId}" for data source "${dataSource.key}".`
	};
	const propertySchema = dataSource.propertySchemasById[propertyId];
	return {
		status: "ok",
		propertyId,
		propertyType: propertySchema.type
	};
}
function invalidOperator(branch) {
	return {
		status: "error",
		error: `Data source query filter branch "${branch}" has an invalid operator or value.`
	};
}
function normalizeJsonValue(value) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number") return normalizeJsonNumber(value);
	if (Array.isArray(value)) return value.map((entry) => normalizeJsonValue(entry));
	if (typeof value === "object") return normalizeJsonObject(value);
	throw new Error("Data source query values must be JSON-compatible.");
}
function normalizeJsonNumber(value) {
	if (!Number.isFinite(value)) throw new Error("Data source query values must be finite JSON numbers.");
	return value;
}
function normalizeJsonObject(value) {
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) throw new Error("Data source query values must be JSON-compatible.");
	const objectValue = value;
	const normalized = {};
	for (const key of Object.keys(objectValue).sort()) {
		const child = objectValue[key];
		if (child !== void 0) normalized[key] = normalizeJsonValue(child);
	}
	return normalized;
}
function isValidIsoDate(value) {
	if (typeof value !== "string") return false;
	const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (dateOnly !== null) {
		const [, year, month, day] = dateOnly;
		return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString().slice(0, 10) === value;
	}
	return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/bridge/dataSources/resolve.js
/**
* Builds the public {@link NotionDataSource} list the SDK exposes to consumers.
*
* Combines the host-supplied bindings (collection pointers + schemas) with the
* manifest's declared data source keys. The host owns every mapping; the SDK
* validates supplied IDs but never infers omitted bindings.
*/
function resolveDataSources(args) {
	return Object.entries(args.manifest.dataSources).map(([key, manifestDataSource]) => {
		const binding = args.dataSourceBindings[key];
		const propertySchemasById = binding?.collectionSchema?.propertiesById ?? {};
		const bindingPropertyIdsByKey = binding?.propertyIdsByKey ?? {};
		const propertyIdsByKey = {};
		const manifestProperties = Object.entries(manifestDataSource.properties ?? {});
		for (const [propertyKey, manifestProperty] of manifestProperties) {
			const propertyId = bindingPropertyIdsByKey[propertyKey];
			propertyIdsByKey[propertyKey] = (propertyId === void 0 ? void 0 : propertySchemasById[propertyId])?.type === manifestProperty.type ? propertyId : void 0;
		}
		return {
			key,
			collectionPointer: binding?.collectionPointer,
			collectionSchema: binding?.collectionSchema,
			propertyIdsByKey,
			propertySchemasById
		};
	});
}
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/bridge/dataSources/resolveProperty.js
function makePropertyError(code, message) {
	return {
		code,
		message,
		isRetryable: false
	};
}
/**
* Resolves a public SDK property write map into the ID-keyed bridge shape.
*
* Identifiers in `properties` may be raw property IDs or data source property keys; the latter
* are looked up in the `dataSource`'s `propertyIdsByKey`. Each value is re-parsed through
* `notionPagePropertyValueSchema` with its `id` rewritten to the resolved property ID.
*/
function resolvePropertyWriteMapForDataSource(args) {
	const { dataSource, properties, operationName } = args;
	const resolvedProperties = {};
	for (const [identifier, value] of Object.entries(properties)) {
		const propertyIdResult = resolvePropertyIdentifierForDataSource({
			dataSource,
			identifier,
			operationName
		});
		if (propertyIdResult.status === "error") return propertyIdResult;
		const propertyId = propertyIdResult.propertyId;
		if (value.id !== void 0 && value.id !== identifier && value.id !== propertyId) return {
			status: "error",
			error: makePropertyError("property_id_mismatch", `Property ${identifier} resolved to ${propertyId} but value id was ${value.id}.`)
		};
		if (resolvedProperties[propertyId] !== void 0) return {
			status: "error",
			error: makePropertyError("duplicate_property", `Cannot set property ${propertyId} more than once.`)
		};
		const parsedValue = /* @__PURE__ */ safeParse(notionPagePropertyValueSchema, {
			...value,
			id: propertyId
		});
		if (!parsedValue.success) return {
			status: "error",
			error: makePropertyError("invalid_property_value", `Invalid value for property ${identifier}.`)
		};
		resolvedProperties[propertyId] = parsedValue.output;
	}
	return {
		status: "success",
		properties: resolvedProperties
	};
}
/**
* Treats bound data source keys as aliases for property IDs. An unbound key may still be used as
* a raw ID when it exactly matches a property in the data source schema.
*/
function resolvePropertyIdentifierForDataSource(args) {
	const { dataSource, identifier, operationName } = args;
	if (dataSource !== void 0 && identifier in dataSource.propertyIdsByKey) {
		const propertyId = dataSource.propertyIdsByKey[identifier];
		if (propertyId === void 0) {
			if (identifier in dataSource.propertySchemasById) return {
				status: "success",
				propertyId: identifier
			};
			return {
				status: "error",
				error: makePropertyError("unmapped_property", `${operationName} cannot resolve property key "${identifier}" because it is not bound to a Notion property.`)
			};
		}
		return {
			status: "success",
			propertyId
		};
	}
	return {
		status: "success",
		propertyId: identifier
	};
}
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/bridge/notifyListener.js
/** Report consumer errors without interrupting bridge operations or other listeners. */
function notifyListener(listener) {
	try {
		listener();
	} catch (error) {
		if (typeof globalThis.reportError === "function") globalThis.reportError(error);
		else setTimeout(() => {
			throw error;
		}, 0);
	}
}
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/bridge/pendingRequests.js
/**
* Tracks one-shot request/response pairs over the `postMessage` bridge. Each `allocate` reserves a
* unique `requestId` and stores its resolver. `resolve` finds the pending resolver by `requestId`
* and calls it, then removes the entry so the same `requestId` cannot be resolved twice.
*/
var PendingRequests = class {
	prefix;
	nextId = 1;
	entries = /* @__PURE__ */ new Map();
	constructor(prefix) {
		this.prefix = prefix;
	}
	allocate(resolver) {
		const requestId = `${this.prefix}-${this.nextId}`;
		this.nextId += 1;
		this.entries.set(requestId, resolver);
		return requestId;
	}
	resolve(requestId, value) {
		const resolver = this.entries.get(requestId);
		if (resolver === void 0) return false;
		this.entries.delete(requestId);
		resolver(value);
		return true;
	}
};
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/bridge/primedResponses.js
/**
* Shared across sandbox bridge instances. Each result type holds one response;
* consuming it removes it, and priming it again replaces the previous response.
*/
var globalPrimedResponsesCache = /* @__PURE__ */ new Map();
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/bridge/SandboxBridge.js
var RESPONSE_TYPE_BY_REQUEST = /* @__PURE__ */ new Map([
	["getPage", "getPageResult"],
	["createPage", "createPageResult"],
	["updatePage", "updatePageResult"],
	["getUser", "getUserResult"],
	["listUsers", "listUsersResult"],
	["queryDataSource", "queryDataSourceResult"]
]);
var INIT_RESULT_TIMER_FALLBACK_MS = 100;
var SandboxBridge = class SandboxBridge {
	hostState = {
		status: "uninitialized",
		theme: "light",
		contrastMode: DEFAULT_CONTRAST_MODE
	};
	listeners = /* @__PURE__ */ new Set();
	messageLog = [];
	messageLogListeners = /* @__PURE__ */ new Set();
	nextRequestId = 1;
	pendingCreatePage = new PendingRequests("custom-block-create-page");
	pendingGetPage = new PendingRequests("custom-block-get-page");
	pendingGetUser = new PendingRequests("custom-block-get-user");
	pendingListUsers = new PendingRequests("custom-block-list-users");
	pendingUpdatePage = new PendingRequests("custom-block-update-page");
	hasSentConnect = false;
	hasReceivedInit = false;
	initializationId;
	hasSentInitResult = false;
	pendingOutboundMessages = [];
	latestDataSourceBindings = {};
	isMockState = false;
	isListening = false;
	resolveInit;
	rejectInit;
	initMessage = new Promise((resolve, reject) => {
		this.resolveInit = resolve;
		this.rejectInit = reject;
	});
	startListening() {
		if (this.isListening || typeof window === "undefined") return;
		this.isListening = true;
		window.addEventListener("message", this.handleMessage);
	}
	static MAX_LOG_ENTRIES = 100;
	logMessage(direction, data) {
		if (this.messageLog.length >= SandboxBridge.MAX_LOG_ENTRIES) this.messageLog.shift();
		this.messageLog.push({
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			direction,
			data
		});
		for (const listener of this.messageLogListeners) listener();
	}
	getMessageLog() {
		return this.messageLog;
	}
	subscribeToMessageLog(listener) {
		this.messageLogListeners.add(listener);
		return () => this.messageLogListeners.delete(listener);
	}
	awaitInit() {
		return this.initMessage;
	}
	sendConnect(manifestResult) {
		if (typeof window === "undefined") return;
		if (this.hasSentConnect) {
			console.warn("[custom-blocks-sdk] ignoring duplicate connect message");
			return;
		}
		const { manifest, error } = manifestResult;
		this.hasSentConnect = true;
		const initializationId = `custom-block-initialization-${this.nextRequestId}`;
		this.nextRequestId += 1;
		this.initializationId = initializationId;
		const connectMessage = error !== void 0 ? {
			type: "connect",
			initializationId,
			status: "error",
			bridgeProtocolVersion: 3,
			sdkVersion: CUSTOM_BLOCKS_SDK_VERSION,
			error
		} : {
			type: "connect",
			initializationId,
			status: "success",
			bridgeProtocolVersion: 3,
			sdkVersion: CUSTOM_BLOCKS_SDK_VERSION,
			...manifest !== null ? { manifest } : {}
		};
		this.postToHost(connectMessage);
	}
	postToHost(message) {
		if (this.hostState.status === "initialized" && !this.hasSentInitResult && !this.isMockState && this.getMessageType(message) !== "initResult") {
			this.pendingOutboundMessages.push(message);
			return;
		}
		this.sendToHost(message);
	}
	sendToHost(message) {
		const messageType = readIncomingType(message);
		if (messageType !== void 0 && typeof message === "object" && message !== null) {
			const responseType = RESPONSE_TYPE_BY_REQUEST.get(messageType);
			const primed = responseType && globalPrimedResponsesCache.get(responseType);
			if (responseType !== void 0 && primed !== void 0) {
				globalPrimedResponsesCache.delete(responseType);
				const response = {
					...primed,
					type: responseType,
					..."requestId" in message ? { requestId: message.requestId } : {},
					..."subscriptionId" in message ? { subscriptionId: message.subscriptionId } : {}
				};
				queueMicrotask(() => this.receiveMessage(response));
				return;
			}
		}
		this.logMessage("sent", message);
		window.parent.postMessage(message, "*");
	}
	flushPendingOutboundMessages() {
		const pendingMessages = this.pendingOutboundMessages;
		this.pendingOutboundMessages = [];
		for (const message of pendingMessages) this.sendToHost(message);
	}
	getMessageType(message) {
		return typeof message === "object" && message !== null && "type" in message ? message.type : void 0;
	}
	notify = () => {
		for (const listener of this.listeners) notifyListener(listener);
	};
	handleMessage = (event) => {
		if (event.source !== window.parent) return;
		this.receiveMessage(event.data);
	};
	receiveMessage(data) {
		this.logMessage("received", data);
		const parsed = /* @__PURE__ */ safeParse(hostToSandboxMessageSchema, data);
		if (!parsed.success) {
			console.warn("[custom-blocks-sdk] ignoring malformed host message", parsed.issues);
			const incomingType = readIncomingType(data);
			if (!this.hasReceivedInit && incomingType === "init" && this.initializationId !== void 0 && readInitializationId(data) === this.initializationId) {
				this.hasReceivedInit = true;
				this.sendInitResultError(invalidInitPayloadError(parsed.issues));
				return;
			}
			if (incomingType !== "invalidSandboxMessage" && incomingType !== "invalidHostMessage") {
				const nack = {
					type: "invalidHostMessage",
					reason: formatInvalidHostReason(incomingType, parsed.issues)
				};
				this.postToHost(nack);
			}
			return;
		}
		const message = parsed.output;
		if (message.type === "invalidSandboxMessage") {
			console.warn("[custom-blocks-sdk] host reported invalid sandbox message:", message.reason);
			return;
		}
		if (message.type === "init") {
			if (message.initializationId !== this.initializationId) {
				console.warn(`[custom-blocks-sdk] ignoring init for unknown initializationId ${message.initializationId}`);
				return;
			}
			if (this.hasReceivedInit) {
				console.warn("[custom-blocks-sdk] ignoring duplicate init message");
				return;
			}
			this.hasReceivedInit = true;
			this.applyInit(message, true);
			return;
		}
		const hostState = this.hostState;
		if (hostState.status !== "initialized") {
			console.warn(`[custom-blocks-sdk] ignoring ${message.type} before init`);
			return;
		}
		switch (message.type) {
			case "themeChanged":
				this.hostState = {
					...hostState,
					theme: message.theme
				};
				syncDocumentAppearance({
					theme: message.theme,
					contrastMode: hostState.contrastMode
				});
				this.notify();
				return;
			case "contrastModeChanged":
				this.hostState = {
					...hostState,
					contrastMode: message.contrastMode
				};
				syncDocumentAppearance({
					theme: hostState.theme,
					contrastMode: message.contrastMode
				});
				this.notify();
				return;
			case "parentChanged":
				this.hostState = {
					...hostState,
					parent: message.parent
				};
				this.notify();
				return;
			case "pageChanged":
				this.hostState = {
					...hostState,
					page: message.page
				};
				this.notify();
				return;
			case "currentUserChanged":
				this.hostState = {
					...hostState,
					currentUser: message.currentUser
				};
				this.notify();
				return;
			case "dataSourcesChanged": {
				const nextBindings = message.dataSources.bindings;
				const dataSources = reuseDataSourcesForUnchangedBindings({
					previousDataSources: hostState.dataSources,
					previousBindings: this.latestDataSourceBindings,
					nextDataSources: this.isMockState ? resolveMockDataSources(nextBindings) : resolveDataSources({
						manifest: hostState.manifest,
						dataSourceBindings: nextBindings
					}),
					nextBindings
				});
				this.latestDataSourceBindings = nextBindings;
				const previousSourcesByKey = new Map(hostState.dataSources.map((source) => [source.key, source]));
				const nextSourcesByKey = new Map(dataSources.map((source) => [source.key, source]));
				const prunedState = {};
				for (const [subscriptionId, state] of Object.entries(hostState.dataSourceState)) {
					const nextSource = nextSourcesByKey.get(state.dataSourceKey);
					if (nextSource === void 0) continue;
					prunedState[subscriptionId] = previousSourcesByKey.get(state.dataSourceKey)?.collectionPointer?.id === nextSource.collectionPointer?.id ? state : createEmptyDataSourceQueryState(state.dataSourceKey);
				}
				this.hostState = {
					...hostState,
					dataSources,
					dataSourceState: prunedState
				};
				this.notify();
				return;
			}
			case "createPageResult": {
				const result = message.status === "success" ? {
					status: "success",
					page: message.page
				} : {
					status: "error",
					error: message.error
				};
				if (!this.pendingCreatePage.resolve(message.requestId, result)) console.warn(`[custom-blocks-sdk] createPageResult for unknown requestId ${message.requestId}`);
				return;
			}
			case "getPageResult": {
				const result = message.status === "success" ? {
					status: "success",
					page: message.page
				} : {
					status: "error",
					error: message.error
				};
				if (!this.pendingGetPage.resolve(message.requestId, result)) console.warn(`[custom-blocks-sdk] getPageResult for unknown requestId ${message.requestId}`);
				return;
			}
			case "getUserResult": {
				const result = message.status === "success" ? {
					status: "success",
					user: message.user
				} : {
					status: "error",
					error: message.error
				};
				if (!this.pendingGetUser.resolve(message.requestId, result)) console.warn(`[custom-blocks-sdk] getUserResult for unknown requestId ${message.requestId}`);
				return;
			}
			case "listUsersResult": {
				const result = message.status === "success" ? {
					status: "success",
					list: message.list
				} : {
					status: "error",
					error: message.error
				};
				if (!this.pendingListUsers.resolve(message.requestId, result)) console.warn(`[custom-blocks-sdk] listUsersResult for unknown requestId ${message.requestId}`);
				return;
			}
			case "updatePageResult": {
				const result = message.status === "success" ? {
					status: "success",
					page: message.page
				} : {
					status: "error",
					error: message.error
				};
				if (!this.pendingUpdatePage.resolve(message.requestId, result)) console.warn(`[custom-blocks-sdk] updatePageResult for unknown requestId ${message.requestId}`);
				return;
			}
			case "queryDataSourceResult": {
				const currentState = hostState.dataSourceState[message.subscriptionId];
				if (currentState === void 0) return;
				const queryResult = message.status === "error" ? {
					items: [],
					hasMore: false,
					error: message.error
				} : {
					items: message.items,
					hasMore: message.hasMore,
					error: void 0
				};
				this.hostState = {
					...hostState,
					dataSourceState: {
						...hostState.dataSourceState,
						[message.subscriptionId]: {
							dataSourceKey: currentState.dataSourceKey,
							items: queryResult.items,
							isLoading: false,
							hasMore: queryResult.hasMore,
							error: queryResult.error,
							latestLimit: currentState.latestLimit,
							latestQueryIdentity: currentState.latestQueryIdentity
						}
					}
				};
				this.notify();
				return;
			}
			default: unreachable(message);
		}
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	getHostState() {
		return this.hostState;
	}
	/**
	* Apply an `init` payload as if it had arrived from the host. Lets callers
	* seed the bridge directly (e.g. the React provider's standalone preview
	* fallback) without going through `postMessage`. The bridge stays unaware
	* of why it's being seeded.
	*/
	setMockState(message) {
		this.isMockState = true;
		this.applyInit(parse(initMessageSchema, message), false);
	}
	completeInitialization() {
		if (this.hasSentInitResult || this.initializationId === void 0 || this.hostState.status !== "initialized") return;
		const result = {
			type: "initResult",
			initializationId: this.initializationId,
			status: "success",
			initialHeight: getInitialContentHeight()
		};
		this.hasSentInitResult = true;
		this.postToHost(result);
		this.flushPendingOutboundMessages();
	}
	sendInitResultError(error) {
		if (this.hasSentInitResult || this.initializationId === void 0) return;
		const result = {
			type: "initResult",
			initializationId: this.initializationId,
			status: "error",
			error
		};
		this.hasSentInitResult = true;
		this.postToHost(result);
		if (this.rejectInit) {
			this.rejectInit(new CustomBlockInitializationError(error));
			this.resolveInit = void 0;
			this.rejectInit = void 0;
		}
	}
	applyInit(message, postResult) {
		if (postResult) this.isMockState = false;
		if (message.status === "error") {
			console.error(`[custom-blocks-sdk] host reported init error (${message.error.code}): ${message.error.message}`);
			if (this.rejectInit) {
				this.rejectInit(new CustomBlockInitializationError(message.error));
				this.resolveInit = void 0;
				this.rejectInit = void 0;
			}
			return;
		}
		const { blockId, parent, page } = message;
		this.latestDataSourceBindings = message.dataSources.bindings;
		const dataSources = postResult ? resolveDataSources({
			manifest: message.manifest,
			dataSourceBindings: this.latestDataSourceBindings
		}) : resolveMockDataSources(this.latestDataSourceBindings);
		const bindingError = getInitBindingError(message.manifest, dataSources);
		if (postResult && bindingError !== void 0) {
			this.sendInitResultError(bindingError);
			return;
		}
		this.hostState = {
			status: "initialized",
			theme: message.theme,
			contrastMode: message.contrastMode,
			blockId,
			parent,
			page,
			currentUser: message.currentUser,
			manifest: message.manifest,
			dataSources,
			dataSourceState: {}
		};
		syncDocumentAppearance({
			theme: message.theme,
			contrastMode: message.contrastMode
		});
		this.notify();
		if (this.resolveInit) {
			this.resolveInit();
			this.resolveInit = void 0;
			this.rejectInit = void 0;
		}
		if (postResult) this.scheduleInitResult(message.initializationId);
	}
	/**
	* Lets the initial application render commit before we acknowledge init. The host keeps the
	* iframe covered throughout this frame, so it can apply the measured height before first paint.
	*/
	scheduleInitResult(initializationId) {
		let didAcknowledge = false;
		let fallbackTimerId;
		const acknowledge = () => {
			if (didAcknowledge) return;
			didAcknowledge = true;
			if (fallbackTimerId !== void 0) window.clearTimeout(fallbackTimerId);
			if (this.initializationId !== initializationId) return;
			this.completeInitialization();
		};
		fallbackTimerId = window.setTimeout(acknowledge, INIT_RESULT_TIMER_FALLBACK_MS);
		if (typeof requestAnimationFrame === "function") requestAnimationFrame(acknowledge);
	}
	createDataSourceSubscriptionId() {
		return `data-source:${globalThis.crypto.randomUUID()}`;
	}
	queryDataSource({ subscriptionId, key, options = {}, forceRequery = false }) {
		if (this.hostState.status !== "initialized") return;
		const dataSource = this.hostState.dataSources.find((entry) => entry.key === key);
		const subscriptionState = this.hostState.dataSourceState[subscriptionId];
		const currentState = subscriptionState?.dataSourceKey === key ? subscriptionState : createEmptyDataSourceQueryState(key);
		if (dataSource === void 0) {
			this.setDataSourceQueryError(subscriptionId, currentState, {
				code: "unknown_data_source_key",
				message: `Unknown data source key "${key}". Known keys: [${this.hostState.dataSources.map((entry) => entry.key).join(", ")}].`,
				isRetryable: false
			});
			return;
		}
		if (dataSource.collectionPointer === void 0) {
			this.setDataSourceQueryError(subscriptionId, currentState, {
				code: "unmapped_data_source",
				message: `Data source "${key}" has not been mapped to a database yet.`,
				isRetryable: false
			});
			return;
		}
		const resolvedQuery = resolveDataSourceQuery({
			dataSources: this.hostState.dataSources,
			key,
			options
		});
		if (resolvedQuery.status === "error") {
			this.setDataSourceQueryError(subscriptionId, currentState, {
				code: "invalid_data_source_query",
				message: resolvedQuery.error,
				isRetryable: false
			});
			return;
		}
		const query = resolvedQuery.query;
		if (!forceRequery && currentState.isLoading && currentState.latestQueryIdentity === query.identity) return;
		this.hostState = {
			...this.hostState,
			dataSourceState: {
				...this.hostState.dataSourceState,
				[subscriptionId]: {
					...currentState,
					dataSourceKey: key,
					isLoading: true,
					error: void 0,
					latestLimit: query.limit,
					latestQueryIdentity: query.identity
				}
			}
		};
		const outbound = {
			type: "queryDataSource",
			subscriptionId,
			dataSourceId: query.dataSourceId,
			limit: query.limit,
			...query.filter !== void 0 ? { filter: query.filter } : {},
			...query.sorts !== void 0 ? { sorts: query.sorts } : {}
		};
		this.postToHost(outbound);
		this.notify();
	}
	setDataSourceQueryError(subscriptionId, currentState, error) {
		if (this.hostState.status !== "initialized") return;
		this.hostState = {
			...this.hostState,
			dataSourceState: {
				...this.hostState.dataSourceState,
				[subscriptionId]: {
					...currentState,
					isLoading: false,
					error,
					latestLimit: void 0,
					latestQueryIdentity: void 0
				}
			}
		};
		this.notify();
	}
	releaseDataSourceSubscription(subscriptionId) {
		if (this.hostState.status !== "initialized" || this.hostState.dataSourceState[subscriptionId] === void 0) return;
		const { [subscriptionId]: _, ...dataSourceState } = this.hostState.dataSourceState;
		this.hostState = {
			...this.hostState,
			dataSourceState
		};
		const outbound = {
			type: "unsubscribeDataSourceQuery",
			subscriptionId
		};
		this.postToHost(outbound);
	}
	postResize(height) {
		if (typeof window === "undefined") return;
		const outbound = {
			type: "resize",
			height: Number.isFinite(height) && height >= 0 ? Math.ceil(height) : 0
		};
		this.postToHost(outbound);
	}
	createPage(args) {
		return new Promise((resolve) => {
			const resolvedParent = this.resolveCreatePageParent(args.parent);
			if (resolvedParent.status === "error") {
				resolve(resolvedParent);
				return;
			}
			const resolvedProperties = resolvePropertyWriteMapForDataSource({
				dataSource: resolvedParent.dataSource,
				properties: args.properties,
				operationName: "createPage"
			});
			if (resolvedProperties.status === "error") {
				resolve(resolvedProperties);
				return;
			}
			const outbound = {
				type: "createPage",
				requestId: this.pendingCreatePage.allocate(resolve),
				parent: resolvedParent.parent,
				properties: resolvedProperties.properties
			};
			if (args.position !== void 0) outbound.position = args.position;
			this.postToHost(outbound);
		});
	}
	getPage(pageId) {
		return new Promise((resolve) => {
			const outbound = {
				type: "getPage",
				requestId: this.pendingGetPage.allocate(resolve),
				pageId
			};
			this.postToHost(outbound);
		});
	}
	getUser(userId) {
		return new Promise((resolve) => {
			const outbound = {
				type: "getUser",
				requestId: this.pendingGetUser.allocate(resolve),
				userId
			};
			this.postToHost(outbound);
		});
	}
	listUsers(args = {}) {
		return new Promise((resolve) => {
			const outbound = {
				type: "listUsers",
				requestId: this.pendingListUsers.allocate(resolve),
				startCursor: args.startCursor,
				pageSize: args.pageSize
			};
			this.postToHost(outbound);
		});
	}
	updatePage(args) {
		const isArchived = args.is_archived ?? args.archived;
		return new Promise((resolve) => {
			if ((args.properties === void 0 || Object.keys(args.properties).length === 0) && args.icon === void 0 && args.cover === void 0 && isArchived === void 0) {
				resolve({
					status: "error",
					error: {
						code: "invalid_page_update",
						message: "updatePage requires at least one property.",
						isRetryable: false
					}
				});
				return;
			}
			const outbound = {
				type: "updatePage",
				requestId: this.pendingUpdatePage.allocate(resolve),
				pageId: args.pageId
			};
			if (args.properties !== void 0) outbound.properties = args.properties;
			if (args.icon !== void 0) outbound.icon = args.icon;
			if (args.cover !== void 0) outbound.cover = args.cover;
			if (isArchived !== void 0) outbound.archived = isArchived;
			this.postToHost(outbound);
		});
	}
	/**
	* Updates a page on a known data source, resolving any property keys against the data source's
	* `propertyIdsByKey` before sending the bridge message. Used by the per-row `update` callback
	* returned from {@link getDataSourceQueryView}.
	*/
	updateDataSourcePage(args) {
		const { dataSource, pageId, pageUpdateArgs } = args;
		const resolvedProperties = pageUpdateArgs.properties === void 0 ? void 0 : resolvePropertyWriteMapForDataSource({
			dataSource,
			properties: pageUpdateArgs.properties,
			operationName: "dataSourcePage.update"
		});
		if (resolvedProperties?.status === "error") return Promise.resolve(resolvedProperties);
		return this.updatePage({
			pageId,
			properties: resolvedProperties?.properties,
			icon: pageUpdateArgs.icon,
			cover: pageUpdateArgs.cover,
			is_archived: pageUpdateArgs.is_archived ?? pageUpdateArgs.archived
		});
	}
	/**
	* Translates the public `CreatePageArgs["parent"]` into the bridge-native
	* `CreatePageMessageParent`. The `data_source_key` variant is resolved sandbox-side against
	* the data source mapping the host delivered in `init` / `dataSourcesChanged`.
	*/
	resolveCreatePageParent(parent) {
		switch (parent.type) {
			case "page_id": return {
				status: "ok",
				parent,
				dataSource: void 0
			};
			case "data_source_id": return {
				status: "ok",
				parent,
				dataSource: this.hostState.status === "initialized" ? this.hostState.dataSources.find((entry) => entry.collectionPointer?.id === parent.data_source_id) : void 0
			};
			case "data_source_key": {
				if (this.hostState.status !== "initialized") return {
					status: "error",
					error: {
						code: "unknown_data_source_key",
						message: `Cannot resolve data source key "${parent.key}" before the host has initialized the SDK.`,
						isRetryable: false
					}
				};
				const dataSource = this.hostState.dataSources.find((entry) => entry.key === parent.key);
				if (dataSource === void 0) return {
					status: "error",
					error: {
						code: "unknown_data_source_key",
						message: `Unknown data source key "${parent.key}". Known keys: [${this.hostState.dataSources.map((entry) => entry.key).join(", ")}].`,
						isRetryable: false
					}
				};
				if (dataSource.collectionPointer === void 0) return {
					status: "error",
					error: {
						code: "unmapped_data_source",
						message: `Data source "${parent.key}" has not been mapped to a database yet.`,
						isRetryable: false
					}
				};
				return {
					status: "ok",
					parent: {
						type: "data_source_id",
						data_source_id: dataSource.collectionPointer.id
					},
					dataSource
				};
			}
			default: unreachable(parent);
		}
	}
};
function getInitialContentHeight() {
	if (typeof document === "undefined") return 0;
	const root = document.getElementById("root");
	if (root === null) return 0;
	return Math.ceil(root.getBoundingClientRect().height);
}
/**
* Makes the document canvas match the host appearance before acknowledging init.
*
* The host reveals the iframe as soon as it receives `initResult.success`. Applying these
* attributes synchronously prevents the browser's default white canvas from flashing while React
* mounts a token scope.
*/
function syncDocumentAppearance(args) {
	if (typeof document === "undefined") return;
	const { theme, contrastMode } = args;
	const root = document.documentElement;
	root.dataset.displayMode = theme;
	root.dataset.contrastMode = contrastMode;
	root.style.colorScheme = theme;
	root.style.backgroundColor = theme === "dark" ? NOTION_DARK_BACKGROUND_BASE : NOTION_LIGHT_BACKGROUND_BASE;
}
/**
* `postMessage` cloning creates new objects even for bindings that did not change.
* Preserve their resolved object identity so React effects only run for changed bindings.
*
* This comparison runs when the host sends an update instead of on every component render.
* Bindings are validated JSON-like bridge payloads, so serialization is sufficient here.
*/
function reuseDataSourcesForUnchangedBindings(args) {
	const previousDataSourcesByKey = new Map(args.previousDataSources.map((dataSource) => [dataSource.key, dataSource]));
	return args.nextDataSources.map((dataSource) => {
		const previousDataSource = previousDataSourcesByKey.get(dataSource.key);
		if (previousDataSource !== void 0 && JSON.stringify(args.previousBindings[dataSource.key]) === JSON.stringify(args.nextBindings[dataSource.key])) return previousDataSource;
		return dataSource;
	});
}
function invalidInitPayloadError(issues) {
	return {
		code: "invalid_init_payload",
		message: formatInvalidHostReason("init", issues),
		isRetryable: false
	};
}
function readInitializationId(data) {
	if (typeof data === "object" && data !== null && "initializationId" in data && typeof data.initializationId === "string") return data.initializationId;
}
function getInitBindingError(manifest, dataSources) {
	for (const [dataSourceKey, manifestDataSource] of Object.entries(manifest.dataSources)) {
		const dataSource = dataSources.find((entry) => entry.key === dataSourceKey);
		if (dataSource?.collectionPointer === void 0 || dataSource.collectionSchema === void 0) return {
			code: "invalid_init_bindings",
			message: `Host did not provide a complete binding for data source "${dataSourceKey}".`,
			isRetryable: false
		};
		for (const propertyKey of Object.keys(manifestDataSource.properties ?? {})) if (dataSource.propertyIdsByKey[propertyKey] === void 0) return {
			code: "invalid_init_bindings",
			message: `Host did not provide a valid binding for property "${dataSourceKey}.${propertyKey}".`,
			isRetryable: false
		};
	}
}
function resolveMockDataSources(bindings) {
	return Object.entries(bindings).map(([key, binding]) => ({
		key,
		collectionPointer: binding.collectionPointer,
		collectionSchema: binding.collectionSchema,
		propertyIdsByKey: { ...binding.propertyIdsByKey ?? {} },
		propertySchemasById: binding.collectionSchema?.propertiesById ?? {}
	}));
}
function formatInvalidHostReason(incomingType, issues) {
	const labelled = incomingType ? `host message of type "${incomingType}"` : "host message";
	const first = issues[0];
	if (!first) return `Could not parse ${labelled}: unknown error`;
	const path = first.path?.map((p) => String(p.key ?? "")).filter(Boolean).join(".") ?? "";
	return `Could not parse ${labelled}: ${path ? `${path}: ${first.message}` : first.message}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ""}`;
}
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/bridge/sandboxClient.js
var bridge;
var didWarnAboutPagesDelete = false;
function getBridge() {
	if (!bridge) bridge = new SandboxBridge();
	return bridge;
}
var customBlockHost = {
	start: () => {
		getBridge().startListening();
	},
	sendConnect: (manifestResult) => {
		getBridge().sendConnect(manifestResult);
	},
	awaitInit: () => {
		return getBridge().awaitInit();
	},
	subscribe: (listener) => {
		return getBridge().subscribe(listener);
	},
	getState: () => {
		return getBridge().getHostState();
	},
	/**
	* Apply an `init` payload directly, bypassing the postMessage handshake for
	* standalone preview state.
	*/
	setMockState: (message) => {
		getBridge().setMockState(message);
	},
	completeInitialization: () => {
		getBridge().completeInitialization();
	},
	postResize: (height) => {
		getBridge().postResize(height);
	}
};
var customBlockDataSources = {
	createSubscriptionId: () => {
		return getBridge().createDataSourceSubscriptionId();
	},
	query: (args) => {
		getBridge().queryDataSource(args);
	},
	release: (subscriptionId) => {
		getBridge().releaseDataSourceSubscription(subscriptionId);
	},
	getView: (hostState, key, subscriptionId) => {
		return getDataSourceQueryView(hostState, key, subscriptionId, (args) => getBridge().updateDataSourcePage(args));
	}
};
var messageLog = {
	getSnapshot: () => {
		return getBridge().getMessageLog();
	},
	subscribe: (listener) => {
		return getBridge().subscribeToMessageLog(listener);
	}
};
/**
* Page-related SDK APIs exposed under `sdk.pages.*`.
*/
var pages = {
	/**
	* Creates a new Notion page.
	*/
	create: (input) => {
		return getBridge().createPage(input);
	},
	/**
	* Fetches a page by id.
	*/
	get: (pageId) => {
		return getBridge().getPage(pageId);
	},
	/**
	* Updates an existing page.
	*/
	update: (input) => {
		return getBridge().updatePage(input);
	},
	/**
	* Archives a page.
	*/
	archive: (pageId) => {
		return getBridge().updatePage({
			pageId,
			is_archived: true
		});
	},
	/**
	* Unarchives a page.
	*/
	unarchive: (pageId) => {
		return getBridge().updatePage({
			pageId,
			is_archived: false
		});
	},
	/**
	* @deprecated This method archives the page. It does not move the page to Trash.
	* Use `pages.archive(pageId)` instead.
	*/
	delete: (pageId) => {
		if (!didWarnAboutPagesDelete) {
			didWarnAboutPagesDelete = true;
			console.warn("[Notion Custom Blocks] DEPRECATED: pages.delete() archives the page. It does not move the page to Trash. Use pages.archive() instead.");
		}
		return getBridge().updatePage({
			pageId,
			is_archived: true
		});
	}
};
/**
* User-related SDK APIs exposed under `sdk.users.*`.
*/
var users = {
	/**
	* Lists users visible in the current custom block workspace.
	*/
	list: (input) => {
		return getBridge().listUsers(input);
	},
	/**
	* Fetches a user by id.
	*/
	get: (userId) => {
		return getBridge().getUser(userId);
	}
};
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/autoResize.js
/** Limits host resize messages to 10 per second while preserving the latest height. */
var AUTO_RESIZE_THROTTLE_MS = 100;
function autoResize(args) {
	const { target } = args;
	if (target === null || target === void 0) return () => {};
	let lastHeightReportedToHost = -1;
	let pendingHeight;
	let throttleTimeout;
	/** Sends a height immediately and records it as the deduplication baseline. */
	const sendHeightToHost = (height) => {
		lastHeightReportedToHost = height;
		customBlockHost.postResize(height);
	};
	/** Sends the latest height queued during the throttling period, if one exists. */
	const flushPendingHeight = () => {
		if (throttleTimeout !== void 0) {
			clearTimeout(throttleTimeout);
			throttleTimeout = void 0;
		}
		if (pendingHeight === void 0) return;
		const height = pendingHeight;
		pendingHeight = void 0;
		sendHeightToHost(height);
		throttleTimeout = setTimeout(flushPendingHeight, AUTO_RESIZE_THROTTLE_MS);
	};
	/** Measures the target and either sends, queues, or deduplicates its height. */
	const measureAndScheduleResize = () => {
		const next = Math.ceil(target.getBoundingClientRect().height);
		if (next === lastHeightReportedToHost) {
			pendingHeight = void 0;
			return;
		}
		if (throttleTimeout !== void 0) {
			pendingHeight = next;
			return;
		}
		sendHeightToHost(next);
		throttleTimeout = setTimeout(flushPendingHeight, AUTO_RESIZE_THROTTLE_MS);
	};
	measureAndScheduleResize();
	if (typeof ResizeObserver === "undefined") return () => {
		clearTimeout(throttleTimeout);
		throttleTimeout = void 0;
	};
	const observer = new ResizeObserver(measureAndScheduleResize);
	observer.observe(target);
	return () => {
		observer.disconnect();
		clearTimeout(throttleTimeout);
		throttleTimeout = void 0;
	};
}
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/bridge/dataSources/subscribe.js
function subscribeToDataSource({ key, onSnapshot, options: providedOptions = {} }) {
	const options = structuredClone(providedOptions);
	const subscriptionId = customBlockDataSources.createSubscriptionId();
	let active = true;
	let lastSnapshotInputs;
	let lastMatchingSignature;
	const deliverSnapshotIfChanged = (hostState, dataSource, queryState) => {
		if (lastSnapshotInputs !== void 0 && lastSnapshotInputs.status === hostState.status && lastSnapshotInputs.dataSource === dataSource && lastSnapshotInputs.queryState === queryState) return;
		const snapshot = customBlockDataSources.getView(hostState, key, subscriptionId);
		lastSnapshotInputs = {
			status: hostState.status,
			dataSource,
			queryState
		};
		notifyListener(() => onSnapshot(snapshot));
	};
	const handleHostChange = () => {
		if (!active) return;
		const hostState = customBlockHost.getState();
		if (hostState.status !== "initialized") {
			deliverSnapshotIfChanged(hostState, void 0, void 0);
			return;
		}
		const dataSource = hostState.dataSources.find((source) => source.key === key);
		const signature = dataSource === void 0 ? null : JSON.stringify(dataSource);
		if (signature !== lastMatchingSignature) {
			const forceRequery = lastMatchingSignature !== void 0;
			lastMatchingSignature = signature;
			customBlockDataSources.query({
				subscriptionId,
				key,
				options,
				forceRequery
			});
			return;
		}
		deliverSnapshotIfChanged(hostState, dataSource, hostState.dataSourceState[subscriptionId]);
	};
	const unsubscribeHost = customBlockHost.subscribe(handleHostChange);
	try {
		handleHostChange();
	} catch (error) {
		unsubscribeHost();
		customBlockDataSources.release(subscriptionId);
		throw error;
	}
	return () => {
		if (!active) return;
		active = false;
		unsubscribeHost();
		customBlockDataSources.release(subscriptionId);
	};
}
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/customBlock.js
/**
* Read block and app context with getters, or follow changes with subscriptions.
* Getters throw if called before `initCustomBlock()` completes. Subscriptions
* can be registered before initialization and deliver the initial value once
* initialization completes, followed by changes to that value.
*
* Each subscription returns an unsubscribe function. Call it when the
* subscription is no longer needed.
*/
var customBlock = {
	/** @deprecated Use an individual subscription method, such as `subscribeToTheme()` or `subscribeToCurrentUser()`. */
	subscribe(listener) {
		return customBlockHost.subscribe(listener);
	},
	/** @deprecated Use an individual getter method, such as `getTheme()` or `getCurrentUser()`, after `initCustomBlock()` resolves. */
	getState() {
		return toPublicState(customBlockHost.getState());
	},
	/**
	* Get the current user viewing the block.
	* Throws if called before SDK initialization completes.
	*/
	getCurrentUser() {
		return getInitializedHostState("getCurrentUser").currentUser;
	},
	/**
	* Subscribes to the current `currentUser` and future changes.
	* Waits for initialization before delivering the initial value.
	*/
	subscribeToCurrentUser(listener) {
		return subscribeToContext({
			key: "currentUser",
			listener
		});
	},
	/**
	* Get the host's current theme.
	* Throws if called before SDK initialization completes.
	*/
	getTheme() {
		return getInitializedHostState("getTheme").theme;
	},
	/**
	* Subscribes to the current `theme` and future changes.
	* Waits for initialization before delivering the initial value.
	*/
	subscribeToTheme(listener) {
		return subscribeToContext({
			key: "theme",
			listener
		});
	},
	/**
	* Get the host's current contrast mode.
	* Throws if called before SDK initialization completes.
	*/
	getContrastMode() {
		return getInitializedHostState("getContrastMode").contrastMode;
	},
	/**
	* Subscribes to the current `contrastMode` and future changes.
	* Waits for initialization before delivering the initial value.
	*/
	subscribeToContrastMode(listener) {
		return subscribeToContext({
			key: "contrastMode",
			listener
		});
	},
	/**
	* Get the custom block's ID. The ID is stable for the lifetime of the block.
	* Throws if called before SDK initialization completes.
	*/
	getBlockId() {
		return getInitializedHostState("getBlockId").blockId;
	},
	/**
	* Delivers the block ID once. The ID is stable for the lifetime of the block.
	* Waits for initialization before delivering the initial value.
	*/
	subscribeToBlockId(listener) {
		return subscribeToContext({
			key: "blockId",
			listener
		});
	},
	/**
	* Get the custom block's parent.
	* Throws if called before SDK initialization completes.
	*/
	getParent() {
		return getInitializedHostState("getParent").parent;
	},
	/**
	* Subscribes to the current `parent` and future changes.
	* Waits for initialization before delivering the initial value.
	*/
	subscribeToParent(listener) {
		return subscribeToContext({
			key: "parent",
			listener
		});
	},
	/**
	* Get the containing page and its parent.
	* Throws if called before SDK initialization completes.
	*/
	getPage() {
		return getInitializedHostState("getPage").page;
	},
	/**
	* Subscribes to the current `page` and future changes.
	* Waits for initialization before delivering the initial value.
	*/
	subscribeToPage(listener) {
		return subscribeToContext({
			key: "page",
			listener
		});
	},
	/**
	* Get the block's declared data source manifest.
	* Throws if called before SDK initialization completes.
	*/
	getManifest() {
		return getInitializedHostState("getManifest").manifest;
	},
	/**
	* Subscribes to the current `manifest` and future changes.
	* Waits for initialization before delivering the initial value.
	*/
	subscribeToManifest(listener) {
		return subscribeToContext({
			key: "manifest",
			listener
		});
	},
	autoResize,
	/**
	* Registers a listener that receives the current query snapshot and later updates.
	* Returns a function that removes this listener. Other listeners remain subscribed.
	*/
	subscribeToDataSource
};
var lastHostState;
var lastPublicState;
function toPublicState(hostState) {
	if (hostState === lastHostState && lastPublicState !== void 0) return lastPublicState;
	lastHostState = hostState;
	if (hostState.status === "uninitialized") {
		lastPublicState = {
			status: "uninitialized",
			theme: hostState.theme,
			contrastMode: hostState.contrastMode
		};
		return lastPublicState;
	}
	lastPublicState = {
		status: "initialized",
		theme: hostState.theme,
		contrastMode: hostState.contrastMode,
		blockId: hostState.blockId,
		parent: hostState.parent,
		page: hostState.page,
		currentUser: hostState.currentUser,
		dataSources: hostState.dataSources
	};
	return lastPublicState;
}
function getInitializedHostState(methodName) {
	const hostState = customBlockHost.getState();
	if (hostState.status !== "initialized") throw new Error(`customBlock.${methodName} called before \`initCustomBlock\` resolved. Await it before reading runtime state.`);
	return hostState;
}
/**
* Subscribe to one context value. Wait for initialization before delivering
* the initial value, then deliver updates when that value changes.
* Return a function that stops delivery, including before initialization.
*/
function subscribeToContext(args) {
	const { key, listener } = args;
	let active = true;
	let delivered = false;
	let previous;
	const deliverIfChanged = () => {
		const state = customBlockHost.getState();
		if (!active || state.status !== "initialized") return;
		const next = state[key];
		if (delivered && Object.is(previous, next)) return;
		previous = next;
		delivered = true;
		notifyListener(() => listener(next));
	};
	const unsubscribe = customBlockHost.subscribe(deliverIfChanged);
	deliverIfChanged();
	return () => {
		active = false;
		unsubscribe();
	};
}
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/bridge/loadManifest.js
var MANIFEST_URL = "manifest";
/**
* On the literal `localhost` hostname, attempts to load the custom block's optional self-hosted
* manifest exposed by the worker dev shell, requested at the page-relative `manifest` path so
* blocks served from a subpath resolve it against their own base.
*
* It is up to the host to decide whether to use this manifest or provide its own persisted manifest.
*/
async function attemptToLoadSelfHostedManifest(hostname = typeof window === "undefined" ? void 0 : window.location.hostname) {
	if (hostname !== "localhost") return { manifest: null };
	let response;
	try {
		response = await fetch(MANIFEST_URL, { credentials: "omit" });
	} catch (error) {
		const message = `Could not fetch ${MANIFEST_URL}.`;
		console.warn(`[custom-blocks-sdk] ${message}`, error);
		return {
			manifest: null,
			error: {
				code: "manifest_unavailable",
				message,
				isRetryable: true
			}
		};
	}
	if (response.status === 404) {
		const message = `No manifest found at ${MANIFEST_URL} (status ${response.status}).`;
		console.warn(`[custom-blocks-sdk] ${message}`);
		return { manifest: null };
	}
	if (!response.ok) {
		const message = `Could not fetch ${MANIFEST_URL} (status ${response.status}).`;
		console.warn(`[custom-blocks-sdk] ${message}`);
		return {
			manifest: null,
			error: {
				code: "manifest_unavailable",
				message,
				isRetryable: isRetryableManifestHttpStatus(response.status)
			}
		};
	}
	let json;
	try {
		json = await response.json();
	} catch (error) {
		const message = `Manifest at ${MANIFEST_URL} was not valid JSON.`;
		console.warn(`[custom-blocks-sdk] ${message}`, error);
		return {
			manifest: null,
			error: {
				code: "manifest_invalid",
				message,
				isRetryable: false
			}
		};
	}
	const parsed = /* @__PURE__ */ safeParse(manifestSchema, json);
	if (!parsed.success) {
		const message = `Manifest at ${MANIFEST_URL} did not match schema.`;
		console.warn(`[custom-blocks-sdk] ${message}`, parsed.issues);
		return {
			manifest: null,
			error: {
				code: "manifest_invalid",
				message,
				isRetryable: false
			}
		};
	}
	return { manifest: parsed.output };
}
function isRetryableManifestHttpStatus(status) {
	return status === 408 || status === 425 || status === 500 || status === 502 || status === 503 || status === 504;
}
//#endregion
//#region node_modules/@notionhq/custom-blocks/dist/init.js
/**
* Error thrown when the SDK is loaded in a top-level standalone window with no parent frame.
* `postMessage` would just hit the same window and the handshake can never complete.
* `<NotionCustomBlock>` catches this specifically and falls back to a standalone preview with a
* warning banner. Direct callers can `instanceof` it to apply their own policy.
*/
var NotInIframeError = class extends CustomBlockInitializationError {
	constructor(message = NOT_IN_IFRAME_MESSAGE) {
		super({
			code: "not_in_iframe",
			message,
			isRetryable: false
		});
		this.name = "NotInIframeError";
	}
};
var NOT_IN_IFRAME_MESSAGE = "<NotionCustomBlock> only works inside an iframe — use the dev shell or deploy to Notion.";
var initPromise;
/**
* Initializes the custom block by running the SDK <-> host handshake.
*
* Resolves with the block's initial context (theme, block location, current
* user, data sources) once the host has initialized the block. Rejects with a
* `CustomBlockInitializationError` if initialization fails.
*
* Idempotent: subsequent calls return the same promise as the first.
* Mount your React tree (or call any SDK hook) only after the returned promise resolves.
*/
function initCustomBlock() {
	if (initPromise === void 0) {
		customBlockHost.start();
		initPromise = performHandshake();
	}
	return initPromise;
}
/**
* Performs the host <-> sandbox SDK handshake:
* 1. On localhost, attempts to load the worker manifest from the page-relative
*    `manifest` path
* 2. Sends `connect` with the manifest
* 3. Awaits the host's `init` message
* 4. Applies the `init` payload and acknowledges with `initResult` (fire-and-forget)
*
* Resolves with the `init` payload after the process above. Rejects with a
* `CustomBlockInitializationError` if any step fails.
*/
async function performHandshake() {
	try {
		if (typeof window !== "undefined" && window.parent === window) throw new NotInIframeError();
		const manifestResult = await attemptToLoadSelfHostedManifest();
		customBlockHost.sendConnect(manifestResult);
		await customBlockHost.awaitInit();
		const hostState = customBlockHost.getState();
		switch (hostState.status) {
			case "initialized": return {
				theme: hostState.theme,
				contrastMode: hostState.contrastMode,
				blockId: hostState.blockId,
				parent: hostState.parent,
				page: hostState.page,
				currentUser: hostState.currentUser,
				dataSources: hostState.dataSources
			};
			case "uninitialized": throw new CustomBlockInitializationError({
				code: "context_unavailable",
				message: "Host block payload is unavailable.",
				isRetryable: true
			});
			default: return unreachable(hostState);
		}
	} catch (error) {
		if (error instanceof CustomBlockInitializationError) throw error;
		throw new CustomBlockInitializationError({
			code: "unknown_error",
			message: error instanceof Error ? error.message : String(error),
			isRetryable: false
		});
	}
}
//#endregion
export { messageLog as a, getDataSourceQueryOptionsIdentity as c, notionBlockIdSchema as d, notionPageIdSchema as f, parse as g, NOTION_PROPERTY_TYPES as h, customBlockHost as i, CustomBlockInitializationError as l, NOTION_BUILTIN_PROPERTY_IDS as m, initCustomBlock as n, pages as o, DEFAULT_CONTRAST_MODE as p, customBlock as r, users as s, NotInIframeError as t, notionUserIdSchema as u };
