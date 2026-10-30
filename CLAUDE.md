@AGENTS.md
@docs/PRD.md

Workflow: build one milestone from docs/PRD.md section 14 at a time. Before finishing any task run
`pnpm lint` and `pnpm exec tsc --noEmit`, add every new UI string to BOTH messages/en.json and messages/as.json,
and confirm `grep -c র messages/as.json` prints 0. Tick finished items in docs/TASKS.md.
