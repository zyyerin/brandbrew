# BrandBrew

Brand curation and guideline tooling: React (Vite) frontend + Supabase Edge Functions (Gemini).

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for deploying Edge Functions)
- Google AI API key (Gemini), for server-side generation

## Local setup (frontend)

1. Copy environment template:

   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local`:

   - `VITE_SUPABASE_PROJECT_REF` — project ref (the subdomain before `.supabase.co`).
   - `VITE_SUPABASE_ANON_KEY` — **anon** key from **Project Settings → API** (not the service role key).
   - Optionally `VITE_EDGE_ROUTE_PREFIX` — must match the Edge route segment in `supabase/functions/server/index.tsx` (`PREFIX`, default `make-server-e35291a5`).

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

**Security:** Never commit `.env.local`. If this repo was ever public with real keys in history, rotate the anon key in the Supabase dashboard.

## Supabase backend

### Database

Create the KV table (name must match `kv_store.tsx` unless you change code everywhere):

```sql
CREATE TABLE kv_store_e35291a5 (
  key TEXT NOT NULL PRIMARY KEY,
  value JSONB NOT NULL
);
```

### Storage

Create a public (or appropriately RLS-scoped) bucket named:

`make-e35291a5-brand-images`

(Defined in `supabase/functions/server/shared/gemini.tsx`. To use a different name, update that constant and redeploy.)

### Forking / new instance ID

The suffix `e35291a5` appears in the Edge path prefix, table name, and bucket name. To use your own ID, replace it consistently in:

- `supabase/functions/server/index.tsx` (`PREFIX`)
- `supabase/functions/server/kv_store.tsx` (table name)
- `supabase/functions/server/shared/gemini.tsx` (bucket)
- Frontend `.env.local`: `VITE_EDGE_ROUTE_PREFIX=make-server-<your-id>`

### Edge Function secrets

Set these in the Supabase dashboard (**Edge Functions → Secrets**) or via CLI:

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Usually auto-provided when deploying |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (server only) |
| `GEMINI_API_KEY` | Google Gemini API |

Deploy the `server` function:

```bash
npm run deploy
# or: supabase functions deploy server
```

## GitHub

After cloning, always add `.env.local` locally. Initial push:

```bash
git init   # if needed
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## License

See [LICENSE](LICENSE).
