/**
 * Listing Deck — eBay OAuth token-exchange helper (Cloudflare Worker)
 * ---------------------------------------------------------------------
 * Purpose: this is the "real exchange flow" referenced in the Pages repo's
 * auth/accepted.html. Once deployed, its /callback URL replaces the
 * GitHub Pages accepted.html page as the "Auth accepted" redirect URI in
 * your eBay developer app settings — eBay will redirect here with
 * ?code=... directly, and this Worker exchanges that code for tokens
 * server-side, where the client secret can safely live.
 *
 * Required secrets (see README.md for `wrangler secret put` commands):
 *   EBAY_CLIENT_ID       - your eBay app's Client ID
 *   EBAY_CLIENT_SECRET   - your eBay app's Client Secret (never expose this
 *                          to any static page or browser-side code)
 *   EBAY_REDIRECT_URI    - the eBay "RuName" / redirect URI this Worker is
 *                          registered under (must match exactly)
 *
 * Optional vars (see wrangler.toml):
 *   EBAY_ENV              - "sandbox" or "production" (default "sandbox")
 */

const TOKEN_ENDPOINT = {
  sandbox: "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
  production: "https://api.ebay.com/identity/v1/oauth2/token",
};

// Same fix as auth/accepted.html: eBay's authorization code is already
// percent-encoded, and depending on the redirect path it can arrive
// encoded twice. Decode repeatedly until it stops changing.
function fullyDecode(value) {
  let current = value;
  for (let i = 0; i < 5; i++) {
    let next;
    try {
      next = decodeURIComponent(current);
    } catch (e) {
      break;
    }
    if (next === current) break;
    current = next;
  }
  return current;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function exchangeCodeForToken(env, code) {
  const endpoint = TOKEN_ENDPOINT[env.EBAY_ENV === "production" ? "production" : "sandbox"];
  const basicAuth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.EBAY_REDIRECT_URI,
  });

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });

  const data = await resp.json();
  return { ok: resp.ok, status: resp.status, data };
}

async function refreshAccessToken(env, refreshToken, scope) {
  const endpoint = TOKEN_ENDPOINT[env.EBAY_ENV === "production" ? "production" : "sandbox"];
  const basicAuth = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);

  const params = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };
  if (scope) params.scope = scope;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams(params).toString(),
  });

  const data = await resp.json();
  return { ok: resp.ok, status: resp.status, data };
}

function jsonResponse(obj, status, origin) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return jsonResponse({ status: "ok", service: "listing-deck-token-exchange" }, 200, origin);
    }

    // eBay redirects the browser here with ?code=...&expires_in=...
    // (this is the production replacement for auth/accepted.html).
    if (url.pathname === "/callback" && request.method === "GET") {
      const rawCode = url.searchParams.get("code");
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        return jsonResponse(
          { error: errorParam, error_description: url.searchParams.get("error_description") || null },
          400,
          origin
        );
      }

      if (!rawCode) {
        return jsonResponse({ error: "missing_code", message: "No ?code= on this URL." }, 400, origin);
      }

      const code = fullyDecode(rawCode);

      try {
        const { ok, status, data } = await exchangeCodeForToken(env, code);
        if (!ok) {
          return jsonResponse({ error: "ebay_token_exchange_failed", ebay_response: data }, status, origin);
        }

        // TODO: persist data.access_token / data.refresh_token against the
        // authenticated seller's account in your own storage instead of
        // returning them directly. Returning them here is fine for the
        // dev/bring-up phase but is not the final production behavior.
        return jsonResponse(
          {
            access_token: data.access_token,
            expires_in: data.expires_in,
            refresh_token: data.refresh_token,
            refresh_token_expires_in: data.refresh_token_expires_in,
            token_type: data.token_type,
          },
          200,
          origin
        );
      } catch (err) {
        return jsonResponse({ error: "internal_error", message: String(err) }, 500, origin);
      }
    }

    // POST /refresh { "refresh_token": "...", "scope": "optional space-separated scopes" }
    if (url.pathname === "/refresh" && request.method === "POST") {
      let payload;
      try {
        payload = await request.json();
      } catch (e) {
        return jsonResponse({ error: "invalid_json" }, 400, origin);
      }

      if (!payload.refresh_token) {
        return jsonResponse({ error: "missing_refresh_token" }, 400, origin);
      }

      try {
        const { ok, status, data } = await refreshAccessToken(env, payload.refresh_token, payload.scope);
        if (!ok) {
          return jsonResponse({ error: "ebay_refresh_failed", ebay_response: data }, status, origin);
        }
        return jsonResponse(
          { access_token: data.access_token, expires_in: data.expires_in, token_type: data.token_type },
          200,
          origin
        );
      } catch (err) {
        return jsonResponse({ error: "internal_error", message: String(err) }, 500, origin);
      }
    }

    return jsonResponse({ error: "not_found" }, 404, origin);
  },
};
