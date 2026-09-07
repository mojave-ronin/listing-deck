# listing-deck

Static pages for eBay's developer-application form (privacy policy + OAuth
redirect pages), plus the serverless helper that does the real token
exchange once you're past the initial app registration.

```
listing-deck/
├── privacy.html              → https://<you>.github.io/listing-deck/privacy.html
├── auth/
│   ├── accepted.html         → https://<you>.github.io/listing-deck/auth/accepted.html
│   └── declined.html         → https://<you>.github.io/listing-deck/auth/declined.html
└── token-exchange/           → separate Cloudflare Worker (see token-exchange/README.md)
```

## 1. Fill in the privacy policy

Open `privacy.html` and replace every `[BRACKETED PLACEHOLDER]`:

- `[EFFECTIVE DATE]`
- `[YOUR LEGAL NAME]` (appears twice)
- `[YOUR CONTACT EMAIL]` (appears three times, including two `mailto:` links)
- `[LIST THE SPECIFIC EBAY API SCOPES YOU REQUEST...]`
- `[ADD SPECIFICS ONCE STORAGE IS BUILT...]`
- `[LIST ANY THIRD-PARTY INFRASTRUCTURE...]`

**Don't find-and-replace the "What is not stored" section.** It's wrapped in
an HTML comment explaining why: that claim (no buyer data, no order data) is
the same assertion behind the eBay Marketplace Account Deletion opt-out from
the developer-application checklist. It has to actually stay true. The day
you add order handling, buyer messaging, or shipping/returns data, come back
and rewrite that section — and revisit the account-deletion notification
opt-out on eBay's side — before shipping that feature.

## 2. Push to GitHub Pages

This repo scaffold was built in a Cowork session, which doesn't have
authority to create a new repository under your personal GitHub account —
that step needs your own GitHub login. From your machine (or GitHub's web
UI):

```bash
# Create the repo (public, since eBay's form requires a public HTTPS URL)
gh repo create listing-deck --public --source=. --remote=origin
# — or create it empty at https://github.com/new and add the remote by hand:
#   git remote add origin https://github.com/<you>/listing-deck.git

git push -u origin main
```

Then enable Pages: repo **Settings → Pages → Build and deployment → Source:
Deploy from a branch → Branch: `main` / `(root)`**. GitHub gives you the
`https://<you>.github.io/listing-deck/...` URLs above once it finishes
building (usually under a minute).

## 3. Fill in the eBay developer form

Use the three URLs at the top of this file as the Privacy Policy URL, Auth
accepted URL, and Auth declined URL. This part is genuinely yours to do —
it's tied to your eBay account and legal identity, so no tool can fill it in
for you.

## 4. Wire the real token exchange

`auth/accepted.html` is a static, no-server dev helper: it reads the `code`
eBay appends to the URL, decodes it (including the double-encoding gotcha),
and gives you a copy button. That's enough to get through initial testing
without standing up a backend.

When you're ready to automate the exchange, deploy the helper in
`token-exchange/` (a free Cloudflare Worker — see `token-exchange/README.md`
for the exact `wrangler` commands) and swap your eBay app's "Auth accepted"
redirect URI from the GitHub Pages URL to the Worker's `/callback` URL. eBay
will then call your endpoint directly instead of the static page.

## 5. Keeping pages in sync with the spec

As scope moves — new OAuth scopes, order handling, buyer data — two things
in this repo need to move with it:

- `privacy.html`'s "What is not stored" section (see the comment in the
  file).
- The eBay Marketplace Account Deletion notification opt-out declared in
  the developer application, which depends on that same claim staying true.

If you want, a future Cowork session can diff the live pages against
whatever the current app spec says and flag drift — just point it at both.
