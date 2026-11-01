# sh4dowcruz.com

Cruz's personal site: profile and links, a Dinosaur and Snake arcade with a shared leaderboard, and a Study section where Claude writes quizzes and flashcards from your notes.

## Deploy (Vercel)

Environment variables:

| Name | What it's for |
| --- | --- |
| `DATABASE_URL` | Postgres (Neon). Added automatically by the Vercel Neon integration. |
| `ANTHROPIC_API_KEY` | Lets Study call Claude. Kept on the server. |
| `BETTER_AUTH_SECRET` | Any long random string. Signs the admin login. |
| `BETTER_AUTH_URL` | `https://sh4dowcruz.com` |
| `STUDY_HOURLY_LIMIT` / `STUDY_DAILY_LIMIT` | Optional. Defaults 12 per visitor per hour, 400 per day. |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-sonnet-5-5`. |

Database migrations in `migrations/` run during `npm run build`.

## Where things live

- `src/site/markup.ts`, `public/site/site.css`, `public/site/site.js`: the public page.
- `src/lib/site-api.server.ts` and `src/routes/api/*`: board, score, music and Study endpoints.
- `src/routes/admin.tsx`: owner login, delete scores, set the music link. The first account created becomes the admin.
