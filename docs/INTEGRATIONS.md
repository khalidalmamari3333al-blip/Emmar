# External integrations: actual status

| Service | Status | What exists in the code |
|---|---|---|
| Phone OTP sign-up | Works once an SMS provider is configured in Supabase Auth | `signInWithOtp` / `verifyOtp` |
| Identity verification via THEQA | **Not connected**: needs official approval | `TheqaProvider` interface returns `theqa_not_connected` |
| Mock identity verification | For testing only; enabled solely by `IDENTITY_MODE=mock` | `MockIdentityProvider` (labelled as mock) |
| Approved e-signature (THEQA) | **Not connected** | In-app signing is a non-government electronic acceptance |
| Municipal lease registration | **Manual**: no API is assumed | `lease_registrations` table; the landlord records the reference number and the admin confirms |

## THEQA (Ministry of Transport, Communications and Information Technology)
Contacts provided by the user (verify them yourself): pki@mtcit.gov.om, Theqa@mtcit.gov.om, 80077777.

Questions to ask before connecting:
1. The approved integration protocol (OIDC/SAML?) and the authorisation and token endpoints.
2. The returned identity attributes (name, civil number, expiry date) and data-use terms.
3. The requirements for approved e-signatures (signing service, certificates, document format).
4. Test environment and approval steps.

When approved: implement `start`/`callback` in `supabase/functions/identity/providers.ts` using the official specification, store `THEQA_CLIENT_ID/SECRET/REDIRECT_URI` as function secrets only (never in the app), and set `identity_provider = 'theqa'`.

## Muscat Municipality: lease registration
Requirements: title deed, survey plan, and both parties' identity documents. Registration is done outside the app; the platform tracks its status only (not_submitted → preparing → submitted → registered/rejected).

## Deployment
- SQL: `supabase/migrations/20270201000001_identity_lease.sql`
- `supabase functions deploy identity` (leave `IDENTITY_MODE` unset in production)
- Payments: `PAYMENTS_MODE` now defaults to disabled
