# C2PA trust lists

The certificates the app trusts when it validates content credentials (ADR-0023). Bundled so validation runs on this
computer and fetches nothing.

| File | Address | Fetched | SHA-256 |
|---|---|---|---|
| C2PA-TRUST-LIST.pem (32 certificates) | https://raw.githubusercontent.com/c2pa-org/conformance-public/main/trust-list/C2PA-TRUST-LIST.pem | 2026-10-28 | b3949271a07b007e92ef1d18050b55388f5e0d2686a16fd864176c48421af8ae |
| C2PA-TSA-TRUST-LIST.pem (23 certificates) | https://raw.githubusercontent.com/c2pa-org/conformance-public/main/trust-list/C2PA-TSA-TRUST-LIST.pem | 2026-10-28 | 7182cb227c02701be0eebd67ab635fca7f85431c32796fb53b267c657cd2c675 |

Licence: Creative Commons Attribution 4.0 International (CC BY 4.0), from c2pa-org/conformance-public. © Coalition
for Content Provenance and Authenticity. Unchanged.

To update: fetch both files again, replace them here, and change the date and SHA-256 above. The app shows the date
of the list it used next to each result.
