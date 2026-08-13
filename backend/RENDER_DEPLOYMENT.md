# MarketLink Backend Render Deployment

## Render Service

- Service type: Web Service
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Do not run migrations from the start command. Run them manually after the database is ready.

## Environment Variables

Set these in Render:

- `NODE_ENV=production`
- `PORT` is provided by Render; the server also falls back to `4000` locally
- `DATABASE_URL`
- `DB_SSL=true` for most managed PostgreSQL/Supabase connections
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGIN` set to your frontend origin, for example your GitHub Pages origin
- `RATE_LIMIT_WINDOW_MS=900000`
- `RATE_LIMIT_MAX=300`
- `LOG_LEVEL=info`

Use long, different JWT secrets. Do not commit real secrets to `.env` or `.env.example`.

## PostgreSQL Or Supabase

1. Create a PostgreSQL database using Render PostgreSQL, Supabase, or another managed provider.
2. Copy the provider connection string into `DATABASE_URL`.
3. Use `DB_SSL=true` unless your provider explicitly says SSL is not required.
4. Deploy the Render service.
5. Open a Render shell for the service and run:

```bash
npm run migrate
```

The migration runner reads SQL files from `backend/src/db/migrations/` and applies them in filename order.

## Test The Backend

After deployment, open:

```text
https://YOUR_RENDER_BACKEND_URL/health
```

Expected response:

```json
{"status":"ok"}
```

The response also includes a timestamp.

## Connect GitHub Pages Frontend

After Render gives you the real backend URL:

1. Open `frontend/MarketLink.html`.
2. Find `MARKETLINK_CONFIG`.
3. Replace the empty API URL with your real Render URL:

```js
API_URL: 'YOUR_RENDER_BACKEND_URL'
```

4. In the Content Security Policy meta tag near the top of the file, add the same Render origin to `connect-src`.
5. In Render, set `CORS_ORIGIN` to your GitHub Pages origin.

Do not leave `YOUR_RENDER_BACKEND_URL` in production. Replace it with the real HTTPS Render service URL.
