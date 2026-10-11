# Supabase Integration Strategy — Gimawi SaaS

## Executive Summary

Gimawi currently uses **PostgreSQL (via `pg` driver) + Row-Level Security (RLS)** running on a **Node.js/Express** backend. This document compares the current architecture against a full **Supabase BaaS (Backend-as-a-Service)** migration, and recommends a **hybrid approach** that leverages Supabase's Realtime capabilities without sacrificing control.

---

## 1. Current Architecture (Node.js/Express + RLS)

```
Client ──HTTP──> Express API ──SQL──> PostgreSQL + RLS
                  │
                  ├── JWT Auth (in-memory)
                  ├── Tenant Isolation (AsyncLocalStorage)
                  ├── bcrypt (cost 12)
                  ├── Winston Logger
                  └── Sentry Error Tracking
```

### Strengths

| Aspect | Detail |
|--------|--------|
| **Full Control** | Every line of middleware, auth, and SQL is owned and auditable |
| **No Vendor Lock-in** | Switch from Supabase to any Postgres host (RDS, Cloud SQL, self-hosted) with zero code changes |
| **Hybrid Security** | JWT + RLS + in-memory tokens + bcrypt double-hashing — defence in depth |
| **Custom Middleware** | Rate limiting, request IDs, tenant context per request |
| **Fine-Grained Rate Limiting** | Per-endpoint (auth, QR, global) separate limits |
| **Audit Trail** | Immutable activity_logs table (trigger-blocked DELETE/UPDATE) |
| **Cost Predictability** | Fixed VPS/server cost regardless of API call volume |

### Weaknesses

| Aspect | Detail |
|--------|--------|
| **Ops Burden** | Must manage server, Postgres backups, scaling |
| **Realtime** | Requires separate WebSocket server (no built-in subscriptions) |
| **Auth Boilerplate** | Refresh token rotation, password reset, OAuth all hand-rolled |
| **No Dashboard** | No Supabase Studio for ad-hoc queries |

---

## 2. Full Supabase BaaS Architecture

```
Client ──HTTP──> Supabase API Gateway
         ↓
    Supabase Auth ──> GoTrue
    Supabase DB  ──> Postgres + RLS
    Supabase Realtime ──> WebSocket
    Supabase Storage ──> S3-compatible
```

### Strengths

| Aspect | Detail |
|--------|--------|
| **Zero Ops** | Managed Postgres, auto-scaling, automated backups |
| **Built-in Auth** | OAuth, magic links, password reset, Row-Level Security integration |
| **Realtime** | Native WebSocket subscriptions via `supabase-js` |
| **Storage** | S3-compatible file storage with RLS policies |
| **Dashboard** | Supabase Studio for querying, inspecting, and managing |

### Weaknesses

| Aspect | Detail |
|--------|--------|
| **Vendor Lock-in** | Supabase-specific SDKs and APIs; migration to another provider is non-trivial |
| **Rate Limiting** | Supabase free/pro tiers throttle API calls; burst traffic can hit limits |
| **Cost at Scale** | Pay-per-request (DB egress, auth MAU, storage bandwidth); unpredictable at enterprise volume |
| **Limited Middleware** | No custom Express middleware; RLS policies must encode all logic |
| **Anti-Tampering** | Immutable activity_logs trigger can be bypassed at DB superuser level |
| **Bcrypt Cost** | Supabase Auth uses its own hashing; cannot enforce cost-12 without self-hosting GoTrue |
| **Data Sovereignty** | Data resides on Supabase servers (US/EU); compliance may require on-premise deployment |

---

## 3. Hybrid Recommendation: Keep Express + Add Realtime Only

### Architecture

```
Client ──HTTP──> Express API ──SQL──> PostgreSQL + RLS (Supabase-hosted or any Postgres)
         │
         └──WebSocket──> Realtime Server (ws library) ──> Redis Pub/Sub
```

### Implementation

- **Database**: Keep Supabase as Postgres host (managed backups, no ops)
- **API**: Keep Express (full control, no lock-in, custom middleware)
- **Realtime**: Add lightweight WebSocket server (`ws` library) for reception screen QR updates
- **Auth**: Keep JWT + bcrypt (Defence in depth; Supabase Auth not used)
- **Storage**: Keep direct-to-S3/MinIO (no Supabase Storage dependency)

### Why This Wins

| Concern | Hybrid Solution |
|---------|----------------|
| Vendor Lock-in | Zero — switch DB host by changing `DATABASE_URL` |
| Realtime | Custom WebSocket server (400 lines) — no external dependency |
| Security | JWT + RLS + in-memory tokens + immutable triggers — multi-layer |
| Ops | Supabase manages Postgres; we manage Express |
| Cost | Fixed server cost + Supabase DB pricing (predictable) |
| Scalability | Horizontally scale Express behind load balancer; read replicas for analytics |

---

## 4. Migration Cost-Benefit

| Factor | Current (Express + RLS) | Full BaaS | Hybrid |
|--------|------------------------|-----------|--------|
| Development | Already built | Rewrite SDK integration | Add ~400 lines WebSocket |
| Performance | Full control | SDK overhead | Same as current |
| Security | Custom multi-layer | Supabase-managed | Best of both |
| Ops Load | Medium (server mgmt) | Zero | Low (only app server) |
| Cost | Server + DB | Per-request pricing | Server + DB |
| Lock-in | None | High | None |
| Realtime | Manual (now added) | Built-in | Lightweight custom |

## Conclusion

**Stay with the current architecture.** The hybrid approach (Express + RLS + Postgres on Supabase) provides enterprise-grade security, zero vendor lock-in, and predictable costs. Add the Realtime WebSocket server (implemented in `server/src/services/realtime.ts`) for the reception screen, and keep full control over auth, middleware, and data.

The only Supabase feature worth adopting is **managed Postgres** — use Supabase as the database host, not as an API gateway.
