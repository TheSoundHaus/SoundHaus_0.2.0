# Canvas LTI 1.3 integration

This doc describes how Soundhaus Classroom talks to Canvas using LTI 1.3
(Learning Tools Interoperability). It covers registration, the OIDC
login flow, resource-link launches, Deep Linking 2.0, AGS score
passback, and NRPS roster sync.

## 1. High-level flow

```
Canvas (Platform)                    Soundhaus (Tool)
      │
      │  1. 3rd-party OIDC login init
      ├──────────────────────────────▶ POST /lti/login
      │                                  │
      │                                  │ 302 → Canvas auth endpoint
      │ ◀────────────────────────────────┘
      │  (user authenticates at Canvas)
      │
      │  2. Launch: POST id_token
      ├──────────────────────────────▶ POST /lti/launch
      │                                  │
      │                                  │ verify JWT, upsert classroom/user
      │                                  │ mint Supabase session, redirect
      │ ◀────────────────────────────────┘
      │  (user lands on Soundhaus web dashboard)
      │
      │  3. Grade posted back
      │ ◀──────────────────────────────  AGS POST score to lineItem URL
      │
      │  4. Roster refresh
      │ ◀──────────────────────────────  NRPS GET context memberships
```

## 2. Tool registration

Each Canvas tenant (school / LMS instance) must register the Soundhaus
tool once. An admin POSTs to `/lti/deployments` with the
`X-Admin-Token` header:

```bash
curl -X POST https://api.soundhaus.io/lti/deployments \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "issuer": "https://canvas.instructure.com",
    "client_id": "1000000000001",
    "deployment_id": "1:abc123",
    "public_jwks_url": "https://canvas.instructure.com/api/lti/security/jwks",
    "auth_login_url":  "https://canvas.instructure.com/api/lti/authorize_redirect",
    "auth_token_url":  "https://canvas.instructure.com/login/oauth2/token",
    "tool_redirect_url": "https://app.soundhaus.io/classroom"
  }'
```

The Soundhaus tool itself is registered inside Canvas (Account
Settings → Developer Keys → + LTI Key) using the values below:

- **Target Link URI**: `https://api.soundhaus.io/lti/launch`
- **OIDC Login URL**: `https://api.soundhaus.io/lti/login`
- **Redirect URIs**: `https://api.soundhaus.io/lti/launch`
- **Public JWK URL**: `https://api.soundhaus.io/.well-known/jwks.json`
- **Deep Linking**: enabled, URL = `https://api.soundhaus.io/lti/deep-link-return`
- **Scopes**: enable AGS (score, lineitem) + NRPS (membership)

## 3. Keys

Soundhaus signs Deep Linking response JWTs + AGS service tokens with an
RSA keypair stored in the `LTI_PRIVATE_KEY_PEM` env var. The public
half is published as a JWKS at
`GET /.well-known/jwks.json`.

Key generation (one-time, kept out of git):

```bash
openssl genrsa -out lti.pem 2048
export LTI_PRIVATE_KEY_PEM="$(cat lti.pem)"
```

## 4. Environment variables

| Var | Purpose |
| --- | --- |
| `LTI_ISSUER` | Platform issuer URL (e.g. `https://canvas.instructure.com`) |
| `LTI_CLIENT_ID` | Client id issued by Canvas |
| `LTI_DEPLOYMENT_ID` | Deployment id |
| `LTI_PRIVATE_KEY_PEM` | RSA private key for signing |
| `LTI_PUBLIC_JWKS_URL` | Canvas's JWKS endpoint (for verifying id_tokens) |
| `LTI_AUTH_LOGIN_URL` | Canvas OIDC auth endpoint |
| `LTI_AUTH_TOKEN_URL` | Canvas token endpoint (for AGS/NRPS access tokens) |

## 5. Deep Linking 2.0 flow

Instructors inside Canvas click "Add Soundhaus assignment template" in
the course editor. Canvas POSTs a deep-link request (a JWT) to the
tool's deep-link URL. The tool UI displays a picker of Soundhaus
assignment templates; when the instructor picks one we call
`POST /lti/deep-link-return` with the chosen template's metadata. The
response returns a signed JWT which the tool auto-submits back to
Canvas; Canvas then creates a resource link and (if AGS is requested)
a grade line-item.

## 6. AGS score passback

On `POST /submissions/{id}/grade` we look up the
`Assignment.canvas_line_item_url` and POST a score payload to
`{lineItem}/scores`. Access tokens are minted via the OAuth 2.0 client
credentials grant against `LTI_AUTH_TOKEN_URL` (handled by
`pylti1p3.ServiceConnector`). See
`services/classroom_service.build_ags_score_payload` for the body
shape.

## 7. NRPS roster sync

When an instructor opens a classroom for the first time we call the
NRPS `context_memberships_url` (claim
`https://purl.imsglobal.org/spec/lti-nrps/claim/memberships`) and
upsert `classroom_members` rows. Subsequent re-syncs compare
`lti_platform_user_id`.

## 8. Security notes

- `id_token` JWTs are verified against Canvas's JWKS before we trust
  any claim. Expired or non-RS256 tokens are rejected.
- Nonces and state values are single-use; pylti1p3 caches them in the
  DB.
- The tool's own private key (`LTI_PRIVATE_KEY_PEM`) must never be
  checked in.
- The `/lti/deployments` admin endpoint is gated by `X-Admin-Token`
  and should only be exposed to internal ops.

## 9. Testing

Canvas provides a free sandbox at <https://canvas.instructure.com>.
The integration test suite uses the `mock_canvas_lti` fixture to drive
launch / AGS / NRPS flows without hitting the network.
