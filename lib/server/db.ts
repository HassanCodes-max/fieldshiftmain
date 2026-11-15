import "server-only";

/**
 * Database access.
 *   production / preview: Postgres from DATABASE_URL or POSTGRES_URL (Supabase, Neon or any Postgres)
 *   development:          PGlite (Postgres compiled to WebAssembly) stored in .data/pglite — no server needed
 * Every query is parameterised ($1, $2 …); user input is never concatenated into SQL.
 */
type Row = Record<string, unknown>;
export interface Db {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
  kind: "postgres" | "pglite";
}

const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "001_init",
    sql: `
create table if not exists location_cache (
  key text primary key,
  lat double precision not null,
  lon double precision not null,
  power_gz bytea not null,
  srtm jsonb,
  fetched_at timestamptz not null default now()
);
create table if not exists saved_plans (
  id text primary key,
  lang text not null check (lang in ('en', 'ur')),
  input jsonb not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  views integer not null default 0
);
create table if not exists feedback (
  id bigserial primary key,
  plan_id text references saved_plans(id) on delete cascade,
  helpful boolean not null,
  comment text check (comment is null or char_length(comment) <= 500),
  lang text,
  region text,
  created_at timestamptz not null default now()
);
create table if not exists market_prices (
  commodity text not null,
  crop text not null,
  market text not null,
  price_date date not null,
  price numeric(12, 2) not null check (price > 0),
  source text not null default 'amis.pk',
  fetched_at timestamptz not null default now(),
  primary key (commodity, market, price_date)
);
create index if not exists market_prices_crop_date on market_prices (crop, price_date desc);
create table if not exists usage_events (
  id bigserial primary key,
  kind text not null,
  region text,
  best text,
  current_rotation text,
  lang text,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_created on usage_events (created_at desc);
create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);
create table if not exists job_runs (
  id bigserial primary key,
  job text not null,
  ok boolean not null,
  detail text,
  ran_at timestamptz not null default now()
);
alter table location_cache enable row level security;
alter table saved_plans enable row level security;
alter table feedback enable row level security;
alter table market_prices enable row level security;
alter table usage_events enable row level security;
alter table rate_limits enable row level security;
alter table job_runs enable row level security;
`,
  },
];

declare global {
  var __fsDb: Promise<Db> | undefined;
}

export const dbUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

async function connect(): Promise<Db> {
  const url = dbUrl();
  if (url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, {
      max: 1, idle_timeout: 20, connect_timeout: 10, prepare: false, onnotice: () => {},
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    });
    return {
      kind: "postgres",
      query: async <T extends Row>(text: string, params: unknown[] = []) =>
        (await sql.unsafe(text, params as never[])) as unknown as T[],
    };
  }
  // production needs a real Postgres; PGlite only for development or an explicit local preview (PGLITE_DIR set)
  if (process.env.NODE_ENV === "production" && !process.env.PGLITE_DIR) throw new Error("DATABASE_NOT_CONFIGURED");
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR || ".data/pglite";
  (await import("node:fs")).mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  return {
    kind: "pglite",
    query: async <T extends Row>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
  };
}

async function migrate(db: Db): Promise<void> {
  await db.query("create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())");
  await db.query("alter table schema_migrations enable row level security");
  const done = new Set((await db.query<{ id: string }>("select id from schema_migrations")).map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    for (const stmt of m.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
    await db.query("insert into schema_migrations (id) values ($1) on conflict do nothing", [m.id]);
  }
}

export function getDb(): Promise<Db> {
  globalThis.__fsDb ??= connect()
    .then(async (db) => {
      await migrate(db);
      return db;
    })
    .catch((e) => {
      globalThis.__fsDb = undefined; // retry on the next request
      throw e;
    });
  return globalThis.__fsDb;
}

/** Run a DB task; return `fallback` (and log) if the database is unavailable. */
export async function tryDb<T>(fn: (db: Db) => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn(await getDb());
  } catch (e) {
    console.error("[db]", e instanceof Error ? e.message : e);
    return fallback;
  }
}
