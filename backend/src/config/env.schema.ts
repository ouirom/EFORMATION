import { z } from 'zod';

/**
 * Validates only the variables the process cannot safely run without --
 * everything else (SMTP, Twilio, Firebase, LiveKit, LDAP, Sentry, ...) is an
 * optional integration that config/index.ts already defaults to "disabled"
 * when unset, and stays that way here. This schema exists to turn a missing
 * *required* var into a clear boot-time error instead of a confusing failure
 * the first time a request touches the DB or signs a token.
 */
const envSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    PORT: z.string().regex(/^\d+$/, 'PORT must be numeric').optional(),
    DB_CLIENT: z.enum(['pg', 'mssql']).optional(),
    DB_HOST: z.string().min(1).optional(),
    DB_NAME: z.string().min(1).optional(),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().optional(),
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
    JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  })
  .superRefine((env, ctx) => {
    // Only the 'pg' path needs SQL-login credentials -- 'mssql' Windows-Auth
    // deliberately ignores DB_USER/DB_PASSWORD (see config/index.ts).
    const client = env.DB_CLIENT ?? 'pg';
    if (client === 'pg' && !env.DB_USER) {
      ctx.addIssue({ code: 'custom', path: ['DB_USER'], message: 'DB_USER is required when DB_CLIENT=pg' });
    }
  });

export function validateEnv(env: NodeJS.ProcessEnv): void {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
}
