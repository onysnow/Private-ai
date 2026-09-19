# Security Policy

This is a private investigative-journalism tool. If you discover a
security vulnerability, please report it privately rather than opening
a public issue.

## Reporting

Open a [private security advisory](../../security/advisories/new) on
this repository, or contact the maintainer directly.

## Scope

- Backend (FastAPI) authorization/authentication boundaries
- Data handling for uploaded documents/evidence
- Dependency vulnerabilities (also tracked via Dependabot)

Please do not include real investigation data, source-identifying
information, or credentials in any report.

## Operator incident response

This policy covers *reporting* a vulnerability to the maintainer. If
you are the operator and something has already gone wrong -- a spike
of denied/rate-limited requests, a suspected leaked connector
credential, or data that looks tampered with -- see
[`INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md) for the operational
runbook (evidence preservation, reading the security audit log,
credential rotation).
