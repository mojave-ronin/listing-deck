# Token-exchange helper

A small Cloudflare Worker that does the part `auth/accepted.html` deliberately
doesn't: it takes eBay's OAuth `code` and exchanges it for an access token
and refresh token, server-side, where your client secret can live safely.

It's free and gets HTTPS automatically (a `*.workers.dev` subdomain, or your
own domain), matching the same constraints eBay checks for the redirect URLs.

## Why this exists separately from the Pages repo

GitHub Pages only serves static files — it can't hold a secret or make a
server-to-server call. `auth/accepted.html` is a static dev stand-in: it
shows you the code so you can paste it somewhere by hand. This Worker is the
real thing. Once it's deployed, go back to your eBay developer app settings
and swap the "Auth accepted" redirect URI from the GitHub Pages URL to this
Worker's `/callback` URL — eBay will call it directly, and it'll do the
exchange for you automatically instead of requiring a copy-paste.

## Endpoints

- `GET /callback` — the redirect target. Reads `?code=` (and handles the
  same double-encoding case as `accepted.html`), exchanges it with eBay,
  and returns the resulting tokens as JSON.
- `POST /refresh` — body `{ "refresh_token": "..." }`, returns a fresh
  access token. eBay refresh tokens are long-lived (~18 months); access
  tokens expire in about 2 hours, so you'll call this often.
- `GET /` — health check.

**Note:** `/callback` currently returns the tokens directly in the response
for the bring-up phase. Before this is used for real users, replace that
with persisting the tokens against the authenticated seller's account in
your own storage (see the `TODO` in `worker.js`) — don't ship an endpoint
that hands access tokens back over an unauthenticated GET.

## Deploy

Requires a (free) Cloudflare account.

```bash
cd token-exchange
npm install -g wrangler   # if you don't have it already
wrangler login

# One-time: store secrets (never commit these; they don't go in wrangler.toml)
wrangler secret put EBAY_CLIENT_ID
wrangler secret put EBAY_CLIENT_SECRET
wrangler secret put EBAY_REDIRECT_URI   # the RuName registered with this route

wrangler deploy
```

`wrangler deploy` prints your Worker's URL, e.g.
`https://listing-deck-token-exchange.<your-subdomain>.workers.dev`. Use
`<that URL>/callback` as the redirect URI you register with eBay once you're
ready to move off the static `accepted.html` page.

To deploy against eBay production instead of sandbox:

```bash
wrangler deploy --env production
```

(and point `EBAY_REDIRECT_URI` / the secrets at your production eBay app's
credentials — sandbox and production are different apps with different
keys on eBay's side).

## Local testing

```bash
wrangler dev
```

This runs the Worker locally with the same secrets. You can hit
`http://localhost:8787/callback?code=...` with a real sandbox code to test
the exchange before deploying.

## Alternatives

Nothing here is Cloudflare-specific in spirit — `worker.js`'s logic
(decode the code, POST to eBay's token endpoint with Basic auth, handle the
response) ports directly to a Vercel/Netlify function or a plain Node
handler if you'd rather standardize on a different platform later. Cloudflare
Workers was picked here only because it's free and needs no server to manage,
matching the same bar eBay's form checks for the static pages.
