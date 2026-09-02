# ntn

Notion Workers projects, built with `@notionhq/workers` and deployed with
the [`ntn` CLI](https://www.npmjs.com/package/ntn).

## Projects

### [`ctc-roadmap-view/`](./ctc-roadmap-view)

A custom block that renders a CTC (continuous transaction controls)
e-invoicing mandate roadmap inside a Notion page: a quarterly kanban fed by
a Features database, filtered to rows tagged `mandate` whose Product
relation is `Compliance transaction(s)`. Cards carry the country flag,
resolved country name, and mandate scopes (B2B/B2G/B2C/…); completed
quarters render green, upcoming ones blue, with a year picker and a PNG
export above the board. See its
[README](./ctc-roadmap-view/README.md) for the database schemas, local dev
shell workflow, and deploy steps.

## Requirements

- Node >= 22, npm >= 10.9.2
- `ntn` CLI (`npm install --global ntn`), logged into the target workspace
- Deploying workers requires that workspace to be on a Business or
  Enterprise plan; local previews via `ntn workers customblocks dev` work
  without one

## Working on a project

```zsh
cd ctc-roadmap-view
npm install
npm run check   # type-check worker + block
npm test        # unit tests
ntn workers customblocks dev   # mock Notion host at localhost:9873
ntn workers deploy --name ctc-roadmap-view
```
