# Rescue Radar — Import history

Static page (no build step) for bringing in medication history from before someone used the Rescue Radar app — upload a file, or fill in a bulk-entry form. Access is via a single-use link the app generates (Settings → Import history), not a login.

## Deploy

1. Push this repo to GitHub (public — GitHub Pages' free tier requires it):
   ```
   git init
   git add .
   git commit -m "Initial import page"
   gh repo create rescue-radar-import --public --source=. --push
   ```
   (or create the repo on github.com first, then `git remote add origin ... && git push -u origin main`)
2. In the repo's **Settings → Pages**: Source = "Deploy from a branch", Branch = `main`, folder = `/ (root)`. Save.
3. Wait a few minutes for the first build, then confirm it loads at `https://<your-username>.github.io/rescue-radar-import/`.
4. Update `IMPORT_SITE_URL` in `rescue-radar/src/lib/importLink.js` (the main app repo) to that URL.

No custom domain yet — deferred, can be added later as a pure DNS/hosting config change (Pages Settings → add a custom domain).

## Local testing

```
python3 -m http.server
```
then open `http://localhost:8000/?t=<a real token from create_import_token>` — the page talks directly to the already-deployed Supabase Edge Functions, so this works without Pages being live yet.
