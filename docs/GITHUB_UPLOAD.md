# MarketLink — GitHub Upload Guide

Two ways to get this project onto GitHub. Either works — pick whichever
you're more comfortable with.

---

## Option A — GitHub website (no command line needed)

1. **Create the repository**
   - Go to [github.com/new](https://github.com/new).
   - Name it (e.g. `marketlink`).
   - Choose Public or Private.
   - Do **not** initialize with a README, `.gitignore`, or license — you
     already have all of those in this project, and letting GitHub create
     its own would cause a conflict when you upload.
   - Click **Create repository**.

2. **Upload the files, preserving folder structure**
   - On the new (empty) repository page, click **uploading an existing file**.
   - Drag the entire `frontend/`, `backend/`, and `docs/` folders — plus
     `README.md`, `.gitignore`, and `.env.example` — into the upload area
     **all at once, from your computer's file browser**.
   - GitHub's drag-and-drop upload preserves folder structure as long as
     you drag actual folders (not files copied out of them individually).
   - **Important**: verify `backend/.env` and `.env` are *not* among the
     files you're dragging — only `.env.example` files should be uploaded.
     If you followed local setup instructions, your real `.env` only exists
     on your own machine and was never part of this delivered project.

3. **Commit**
   - Scroll down, add a commit message (e.g. "Initial MarketLink upload"),
     and click **Commit changes**.

4. **Verify the structure**
   - Open the repository and confirm you see `frontend/`, `backend/`,
     `docs/` as folders (not flattened), each containing their files.

5. **Enable GitHub Pages for the frontend** (optional, if you want to host
   the frontend this way)
   - Go to **Settings → Pages**.
   - Under **Source**, choose the branch (usually `main`) and set the
     folder to `/frontend` if that option is available, or `/ (root)` if
     not — in that case you'd move/copy `frontend/MarketLink.html` to the
     repo root, or use a `docs/` folder trick, since GitHub Pages only
     serves from repo root or a `/docs` folder, not arbitrary subfolders,
     on the free tier.
   - **Before publishing**, follow `docs/DEPLOYMENT.md` to set
     `MARKETLINK_CONFIG.API_URL` in `MarketLink.html` to your real deployed
     backend — otherwise visitors will hit the same "Cannot reach server"
     issue this project fixed the root cause of.

---

## Option B — Git command line

```bash
# From inside the MarketLink project folder (the one containing
# frontend/, backend/, docs/, README.md, etc.)

git init
git add .
git commit -m "Initial MarketLink upload"
git branch -M main

# Replace <your-username> and <your-repo> with your actual GitHub details.
# Create the empty repository on GitHub first (github.com/new), same as
# step 1 in Option A, without initializing it with any files.
git remote add origin https://github.com/<your-username>/<your-repo>.git

git push -u origin main
```

If you use SSH instead of HTTPS for GitHub auth:

```bash
git remote add origin git@github.com:<your-username>/<your-repo>.git
```

No credentials are embedded in any of these commands — Git will prompt you
to authenticate (a personal access token for HTTPS, or your SSH key) using
whatever method you've already configured with GitHub.

### Double-check before pushing

```bash
git status              # confirm no .env, node_modules/, or *.log files are staged
cat .gitignore          # confirm it excludes them (it does, by default, in this project)
```

If `git status` shows `backend/.env` or `node_modules/` as untracked-but-
about-to-be-added, something is wrong with your local `.gitignore` — stop
and fix that before committing, so no real secrets or dependency bloat ever
reach a public repository.

---

## After uploading: separate deployment

GitHub (Pages or otherwise) only hosts the **static frontend**. It does
**not** run Node.js, Express, PostgreSQL, or anything server-side. The
correct architecture is:

```
GitHub Pages (frontend/MarketLink.html)
        │
        │  HTTPS API requests
        ▼
MarketLink Backend  (deployed separately — Railway, Render, Fly.io,
        │            a VPS, or similar; NOT deployed anywhere by this project)
        ▼
PostgreSQL  (a managed instance, or self-hosted alongside the backend;
             also NOT deployed anywhere by this project)
```

Deploy `backend/` to whichever Node.js host you choose, provision a
PostgreSQL database, set the environment variables from
`backend/.env.example` with real values, run the migrations, then update
`frontend/MarketLink.html`'s `MARKETLINK_CONFIG.API_URL` (see
`docs/DEPLOYMENT.md`) to point at that backend's real URL before
publishing the frontend.

No hosting provider or production URL has been invented or assumed here —
you'll need to choose one and complete that deployment yourself, then wire
the two together as described above.
