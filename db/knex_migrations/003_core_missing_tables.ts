import type { Knex } from 'knex';

/**
 * Knex equivalent of db/migrations/003_core_missing_tables.sql — proof that
 * the SQL-Server migration set can be re-expressed portably via the Knex
 * schema builder (see the DBMS-portability plan). Guards each table with
 * `hasTable` so it's a no-op against a database where the original .sql
 * migration already ran (mirrors that file's `IF OBJECT_ID(...) IS NULL`
 * guards). The other 9 migration files remain .sql-only for now — this one
 * file is the pattern to follow when converting the rest.
 */
export async function up(knex: Knex): Promise<void> {
  const now = knex.fn.now();

  if (!(await knex.schema.hasTable('course_assignments'))) {
    await knex.schema.createTable('course_assignments', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('tenant_id').notNullable().references('id').inTable('tenants');
      table.bigInteger('course_id').notNullable().references('id').inTable('courses');
      table
        .string('assignment_type', 20)
        .notNullable()
        .checkIn(['user', 'enterprise', 'direction', 'service', 'role']);
      table.bigInteger('target_id').nullable();
      table.string('target_role', 20).nullable();
      table.boolean('is_mandatory').notNullable().defaultTo(false);
      table.dateTime('due_date').nullable();
      table.bigInteger('assigned_by').notNullable().references('id').inTable('users');
      table.dateTime('created_at').notNullable().defaultTo(now);
      table.index('course_id', 'idx_course_assignments_course');
    });
  }

  if (!(await knex.schema.hasTable('enrollments'))) {
    await knex.schema.createTable('enrollments', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('tenant_id').notNullable().references('id').inTable('tenants');
      table.bigInteger('user_id').notNullable().references('id').inTable('users');
      table.bigInteger('course_id').notNullable().references('id').inTable('courses');
      table.integer('progress_percent').notNullable().defaultTo(0);
      table.dateTime('enrolled_at').notNullable().defaultTo(now);
      table.dateTime('started_at').nullable();
      table.dateTime('completed_at').nullable();
      table.unique(['user_id', 'course_id'], { indexName: 'uq_enrollments_user_course' });
    });
  }

  if (!(await knex.schema.hasTable('lesson_progress'))) {
    await knex.schema.createTable('lesson_progress', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('tenant_id').notNullable().references('id').inTable('tenants');
      table.bigInteger('user_id').notNullable().references('id').inTable('users');
      table.bigInteger('lesson_id').notNullable().references('id').inTable('lessons');
      table.bigInteger('course_id').notNullable().references('id').inTable('courses');
      table
        .string('status', 20)
        .notNullable()
        .defaultTo('not_started')
        .checkIn(['not_started', 'in_progress', 'completed']);
      table.integer('progress_percent').notNullable().defaultTo(0);
      table.integer('time_spent_seconds').notNullable().defaultTo(0);
      table.dateTime('started_at').nullable();
      table.dateTime('completed_at').nullable();
      table.dateTime('last_accessed_at').nullable();
      table.unique(['user_id', 'lesson_id'], { indexName: 'uq_lesson_progress_user_lesson' });
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('lesson_progress');
  await knex.schema.dropTableIfExists('enrollments');
  await knex.schema.dropTableIfExists('course_assignments');
}
