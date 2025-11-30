import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: '66879f94-f773-4da3-819c-c56b2210cbb5',
    token: process.env.CLOUDFLARE_API_TOKEN!,
  },
} satisfies Config;
