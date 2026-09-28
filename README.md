# Expense Sync

Real-time shared expense tracker. React + Vite front end, **Firebase Realtime Database** for storage/sync, deployed on **Netlify**.

- Login with just a username (no password)
- Create tabs (headers) and add expense items inside each tab, with per-tab and overall totals
- Share an account with one other person via 6-character code, link, or QR scan (max 2 people per account)
- Live sync: changes appear on the other screen within ~100 ms as they're typed
- Presence: see when your partner is online, which tab they're on, and which field they're editing (that field is locked for you until they leave it)
- Works offline; edits sync when the connection returns

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
