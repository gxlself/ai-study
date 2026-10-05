# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| `0.0.x` | Yes |

## Reporting a Vulnerability

Please use GitHub's private vulnerability reporting flow:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include the affected version, component, reproduction steps, impact, and any safe mitigation.

Do not include credentials, household data, child data, or private network details in a public issue. If GitHub private reporting is unavailable, email `gxlself@gmail.com` with `[security]` in the subject and avoid sending secrets.

The server, player, admin, activity, and plugin security boundaries are documented in [`apps/admin/SECURITY.md`](apps/admin/SECURITY.md), [`apps/player/src/security/SECURITY.md`](apps/player/src/security/SECURITY.md), [`packages/activities/src/SECURITY.md`](packages/activities/src/SECURITY.md), and [`docs/dev/reviews/security-review.md`](docs/dev/reviews/security-review.md).

## Disclosure

Please allow time for triage, a fix, and a coordinated release before public disclosure. We will acknowledge good-faith reports and avoid exposing reporter identity without permission.
