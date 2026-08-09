import Knex from 'knex';
import { types as pgTypes } from 'pg';
import { config } from '../config';

// node-pg returns BIGINT/int8 columns (every id, tenant_id, and COUNT(*) result in
// this schema) as JS strings by default, to avoid silently losing precision above
// Number.MAX_SAFE_INTEGER. mssql's driver returns the equivalent columns as native
// numbers, and the whole app (frontend arithmetic like `total.reduce((a,b) => a+b)`,
// `===` comparisons, etc.) was written assuming that -- e.g. summing per-course
// enrollment counts silently string-concatenated ("1"+"0"+"1" -> "101") instead of
// adding. This app's ids/counts never approach that precision ceiling, so parsing
// bigint as a number is the correct, global fix (OID 20 = int8/bigint) rather than
// hunting down every call site that does arithmetic on a query result.
pgTypes.setTypeParser(20, (value: string) => parseInt(value, 10));

/**
 * Builds the Knex connection config for whichever client is active
 * (config.database.client, from DB_CLIENT). Shared by the runtime singleton
 * below and by ../../knexfile.ts (the CLI-facing config for `knex migrate:*`),
 * so the two never drift apart.
 */
export function buildKnexConfig(): Knex.Knex.Config {
  const { client, server, database, port, user, password, options, ssl, pool } = config.database;

  if (client === 'pg') {
    return {
      client: 'pg',
      connection: {
        host: server,
        database,
        port: port || 5432,
        user,
        password,
        ssl: ssl ? { rejectUnauthorized: false } : false,
      },
      pool,
    };
  }

  // Knex's mssql client is tedious-based and requires SQL-login auth — it does
  // NOT support the Windows-Integrated-Auth path this project's own dev SQL
  // Server instance is locked to (see database.service.ts). Use this only
  // against an SQL Server instance with Mixed Mode auth enabled and a real
  // SQL login provisioned. The default runtime path for 'mssql' bypasses Knex
  // entirely (see database.service.ts) — this branch exists so the CLI config
  // and a future Mixed-Mode-enabled deployment both have somewhere to land.
  return {
    client: 'mssql',
    connection: {
      server,
      database,
      port: port || 1433,
      user,
      password,
      options,
    },
    pool,
  };
}

let instance: Knex.Knex | null = null;

/** Lazily-created singleton Knex instance for the 'pg' runtime path. */
export function getKnex(): Knex.Knex {
  if (!instance) {
    instance = Knex(buildKnexConfig());
  }
  return instance;
}

export async function closeKnex(): Promise<void> {
  if (instance) {
    await instance.destroy();
    instance = null;
  }
}
