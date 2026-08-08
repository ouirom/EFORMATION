import type { Knex } from 'knex';
import { buildKnexConfig } from './src/database/knex';

// CLI-facing config for `knex migrate:*` / `knex migrate:make` (run from
// backend/, e.g. `npm run migrate:latest`). Reuses the exact same connection
// builder as the runtime singleton (./src/database/knex.ts) so the CLI never
// connects somewhere different than the app does.
const knexConfig: Knex.Config = {
  ...buildKnexConfig(),
  migrations: {
    directory: '../db/knex_migrations',
    extension: 'ts',
  },
};

export default knexConfig;
