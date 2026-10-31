# Time servers' root certificates

The roots a capture's time proof is checked against (RFC 3161, ADR-0025). Bundled so a token is checked on this
computer: the signature, the certificate chain to one of these roots, the fingerprint it signed and the request's
nonce. A token from a time server with no root here is kept and shown as "not checked here".

| File | Time server | Address | Fetched | SHA-256 |
|---|---|---|---|---|
| freetsa-root.pem | https://freetsa.org/tsr (the default) | https://freetsa.org/files/cacert.pem | 2026-10-29 | 2151b61137ffa86bf664691ba67e7da0b19f98c758e3d228d5d8ebf27e044438 |
| sigstore-root.pem | https://timestamp.sigstore.dev/api/v1/timestamp | the self-signed root in https://timestamp.sigstore.dev/api/v1/timestamp/certchain | 2026-10-29 | bf6960b216d500905b7f71129be406a60a38a3dd34eea82fad5b36cc22dbb03f |

Public certificates, unchanged. To change the time server, set `CAPTURE_TIME_SERVER` and put its root here with its
line above; a server whose root is missing still stamps, but its token is not checked here.
