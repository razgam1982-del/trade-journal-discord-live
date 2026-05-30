<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project state — read first

Before editing anything in `app/positions/`, `components/PositionsTable.tsx`, `components/StockJournal.tsx`, or `services/position-service.ts`, read [`PROJECT_STATE.md`](./PROJECT_STATE.md). It covers:
- The three channels and their templates
- DB schema and rollback identifiers
- Business rules learned from bugs (`חצי` = fraction of remaining, `100%` overrides leg-scoped, `STOP X נקודות` = points distance, shorts-with-open-loss → 0, …)
- File map (services, components, server actions)
- Recent commits and open todos
- Where backfill scripts live (`C:/Users/razga/Documents/`)

When the change is more than ~50 lines or affects user-visible behaviour, update `PROJECT_STATE.md` in the same commit.
