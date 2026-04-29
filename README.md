# Mohr Insurance — Ad Performance Dashboard

A Node.js web dashboard that connects to GoHighLevel CRM to track Meta Ads performance for a Medicare insurance agency. It pulls leads by ad creative, lets you manually input ad spend, and calculates cost per lead (CPL) for each ad.

## Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your GHL API key and Location ID
   ```

3. **Start the server:**
   ```bash
   npm start
   # Or with auto-reload:
   npm run dev
   ```

4. Open http://localhost:3000

## Environment Variables

| Variable | Description |
|---|---|
| `GHL_API_KEY` | GoHighLevel API key (Bearer token) |
| `GHL_LOCATION_ID` | GHL Location ID |
| `PORT` | Server port (default: 3000) |

## Deploying to Railway

1. Push this repo to GitHub.
2. Create a new project on [Railway](https://railway.app) and connect the repo.
3. Add the environment variables (`GHL_API_KEY`, `GHL_LOCATION_ID`) in the Railway dashboard.
4. Railway will auto-detect the `Procfile` and deploy.

The SQLite database is stored at `./data/dashboard.db` and is created automatically on first run.

## Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** Vanilla HTML/CSS/JS
- **Database:** SQLite (better-sqlite3)
- **API:** GoHighLevel v2
