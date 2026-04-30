# Hosting & scaling decision — experimental-changes buildout

This doc captures the hosting gate the `experimental-changes` plan
defers per-phase, so the answer is recorded once and revisited only
when the thresholds are hit.

## TL;DR

**Stay on DigitalOcean.** Current Droplet + Managed Postgres + add
Managed Redis this quarter. Migrate audio assets to Cloudflare R2 when
Phase 5 ships. Add a DO Load Balancer + second Droplet only when
sustained CCU or `/repos/public` latency warrants it. Do NOT move to
DOKS or Fly.io yet.

## 1. Current architecture (experimental-changes)

- **FastAPI**: single DO Droplet (`soundhaus-api`) behind Nginx.
- **Gitea + LFS**: same Droplet, bundled storage.
- **Postgres**: Supabase (managed) for auth + user data; the FastAPI
  `repo_data` / `subscriptions` / etc. tables live on a separate DO
  Managed Postgres instance.
- **Redis**: added in Phase 1 (DO Managed Redis, smallest tier).
- **Audio assets**: currently local disk on the Droplet. Migration
  target = Cloudflare R2 (Phase 5).

## 2. Decision rules

### Stay on DO Droplet until ONE of:

- **Sustained >500 CCU** on the FastAPI service for more than 10
  minutes in a 24h window, OR
- **p95 latency on `/repos/public` > 400ms** after Redis cache is
  warm, OR
- **CPU > 70%** sustained for 15 min on the `soundhaus-api` Droplet,
  OR
- **R2 egress > 500 GB / month** (then evaluate cost of moving compute
  closer to R2 via Cloudflare Workers).

### When the threshold fires:

1. **First response (zero downtime):** Add DO Load Balancer + a second
   identical Droplet running FastAPI in a read-replica + write-through
   setup. Redis already exists, so session state is shared.
2. **Second response (one quarter later):** If traffic is still
   growing, evaluate **DOKS (DigitalOcean Kubernetes)**. This is a
   non-trivial migration — budget 2–3 weeks — and should only happen
   when we have a clear 6-month runway of growth. The trigger is
   >10k DAU or a multi-region need.
3. **Fly.io**: not on the critical path. Only consider if a specific
   regulatory or latency requirement forces edge-first hosting.

## 3. Phase-by-phase hosting impact

| Phase | Hosting work |
| --- | --- |
| 0–1 | None beyond adding DO Managed Redis + wiring Sentry. |
| 2 | Explore performance work (Redis + precomputed scores) reduces `/repos/public` latency — this directly lowers the odds of tripping the Load Balancer threshold. |
| 3–4 | None. |
| 5 (Sample Marketplace) | **Migrate audio/snippet/thumbnail storage to Cloudflare R2.** Biggest perf + cost win. Single Droplet can stay. |
| 6 (Billing) | None — Stripe hosts Checkout/Portal. Add a tiny cron worker (systemd timer) on the Droplet for subscription reconciliation. |
| 7 (Collab marketplace) | Stripe Connect hosted onboarding. Droplet serves API only. |
| 8 (Classroom + LTI) | Adds `/lti/*` endpoints + JWKS. No extra infra. Canvas traffic is spiky (launch windows) — if we see 5× spikes, trigger the Load Balancer response *only* for the duration. |

## 4. Budget

| Resource | Tier | Monthly |
| --- | --- | --- |
| DO Droplet (s-4vcpu-8gb) | shared-CPU | $48 |
| DO Managed Postgres (1 GB RAM) | basic | $15 |
| DO Managed Redis (1 GB RAM) | basic | $15 |
| Cloudflare R2 | first 10 GB free, $0.015/GB after | ~$5 |
| Sentry (team) | 50k events / mo | $0 (free tier) |
| Grafana Cloud | free tier | $0 |
| **Total** | | **~$83 / mo** |

Projected trigger for scale-out (Load Balancer + 2nd Droplet):
**+$60 / mo** (Load Balancer $12, Droplet $48).

## 5. Signals to watch

Wire these into the Grafana Cloud dashboard added in Phase 1:

- `fastapi_http_latency_p95` for `/repos/public` and `/repos/{owner}/{repo}`
- `redis_keyspace_hits_ratio` (should be >0.9 after Phase 2)
- `postgres_connection_count`
- `cf_r2_egress_bytes`
- Count of concurrent WebSocket / SSE clients (future)

## 6. What we explicitly won't do (yet)

- Port FastAPI to Rust — the existing Rust native module at
  `apps/desktop/native/semantic-diff/` is the type-safe boundary
  referenced in the plan; we keep JSON contracts.
- Self-host Postgres — DO Managed Postgres or Supabase is always
  cheaper than ops time.
- Multi-region — Canvas LTI sessions are US-centric; revisit if we
  sign an EU institution.
