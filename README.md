# Expense Sync

Real-time shared expense tracker. React + Vite front end, **Firebase Realtime Database** for storage/sync, deployed on **Netlify**.

- Login with just a username (no password)
- Create tabs (headers) and add expense items inside each tab, with per-tab and overall totals
- Share an account with one other person via 6-character code, link, or QR scan (max 2 people per account)
- Live sync: changes appear on the other screen within ~100 ms as they're typed
- Presence: see when your partner is online, which tab they're on, and which field they're editing (that field is locked for you until they leave it)
- Works offline; edits sync when the connection returns
- Netflix-style dark UI with a "Who's spending?" profile picker; stays signed in on a device for 6 months
- Per-user theme colour (saved to the user, so it follows them across devices)
- Installable: "Add to Home Screen" on iPhone with app icon, launch screens and an animated splash
- Budget rows: item, free-text category, multi-line note and amount; each amount is paid Monthly or Yearly, and totals switch between monthly and yearly views
- Months & years: every budget lives in a period ("2026-09" or "2026"); copy a whole budget to other months/years; items changed since the previous period are highlighted
- Merge items into one (e.g. "Hamizan insurance") with a pull-up breakdown; each merged item can show its own monthly/yearly view
- Savings tracking per item: Jan–Dec log, filled from each month's budget and adjustable
- Categories page: every item in a category across head categories, with custom subcategories, custom fields and a choice of what counts toward the total
- Salary summary: each person's salary and what's left after the head categories they choose
- "Paste from sheet": copy cells from Excel/Google Sheets; each titled section becomes a tab, multi-line cells become notes, TOTAL rows are skipped
- Delete an account: it goes to a bin for 7 days (either member can restore it) and is deleted for good the next time either member opens the app after that

## App icon & launch screens

Generated from code by `npm run assets` (see `scripts/generate-assets.mjs`) into `public/`. The output is committed, so you only need to rerun it if you change the design.

## Why Firebase Realtime Database

| Need | How RTDB handles it |
|---|---|
| Live, no lag | Persistent WebSocket; local writes update the UI instantly, then sync |
| Online status | `onDisconnect()` lets the **server** clear your status if you close the tab or lose signal |
| "X is editing" locks | Same presence mechanism, per field |
| Concurrent edits | Each keystroke writes only that one field, so edits to different fields never collide |
| No backend to run | Static site on Netlify talks to Firebase directly |
| Cost | Free Spark plan: 100 simultaneous connections, 1 GB stored, 10 GB/month transfer |

## 1. Create the Firebase project (≈5 min)

1. Go to <https://console.firebase.google.com> → **Add project** (Google Analytics not needed).
2. **Build → Realtime Database → Create database**. Pick the region closest to you, start in **locked mode**.
3. Open the **Rules** tab, paste the contents of [`database.rules.json`](database.rules.json), **Publish**.
4. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**
   (Users still only type a username; this silently gives each device a session so the rules can block anonymous scrapers.)
5. **Project settings (⚙) → General → Your apps → Web (`</>`)** → register an app → copy the config values.

## 2. Run locally

```bash
cp .env.example .env.local   # then fill in the values from step 5
npm install
npm run dev
```

Open two different browsers (or one normal + one private window), log in as two usernames, and share.

## 3. Deploy to Netlify

**Option A: Git (recommended, auto-deploys on push)**
1. Push this folder to a GitHub repo.
2. Netlify → **Add new site → Import an existing project** → pick the repo. Build settings are read from `netlify.toml`.
3. **Site configuration → Environment variables**: add the five `VITE_FIREBASE_*` variables.
4. **Deploys → Trigger deploy**.

**Option B: CLI**
```bash
npm install -g netlify-cli
netlify login
netlify init            # create/link the site
netlify env:set VITE_FIREBASE_API_KEY "..."   # repeat for all five
netlify deploy --build --prod
```

Finally, in Firebase **Authentication → Settings → Authorized domains**, add your `*.netlify.app` domain.

> QR scanning needs camera access, which browsers only allow on HTTPS (Netlify gives you that) or `localhost`.

## Data model

```
users/{username}/ledgers/{ledgerId}: true
codes/{CODE}: ledgerId
ledgers/{ledgerId}/meta        { name, owner, partner, code, currency }
ledgers/{ledgerId}/members     { username: joinedAt }      ← only owner + partner; the partner slot is
                                                             claimed by a transaction and can't be overwritten
ledgers/{ledgerId}/tabs/{id}   { name, order }
ledgers/{ledgerId}/items/{tabId}/{id}  { date, name, amount, order, updatedBy, updatedAt }
presence/{ledgerId}/{username}/{connectionId}  { tab, editing, since }
```

## Security note

Username-only login means **anyone who knows (or guesses) your username can open your expenses**. That's what you get from passwordless-by-username, and it's fine for casual personal tracking. If you later want real protection, the easiest upgrade is Firebase **Email link** or **Google** sign-in: swap `ensureAuth()` in `src/firebase.js` and tighten the rules to check `auth.uid`.
