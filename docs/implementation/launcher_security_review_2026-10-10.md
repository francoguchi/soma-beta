# Launcher troubleshooting and scoped security review

Observed 2026-10-10 on `feat/beta-ui-v2`, base HEAD
`8adafa3387c917a0642289bd5e57c0f4dbad4619`. Accepted design pin remains
`9a0e891127a771251afccca1a281b7ef7dde9e5f`; LLD-12 technology, diagnostics,
module ownership and trusted-instance contracts govern this review. This is
development evidence, not security or release certification.

## Startup diagnosis and repair

1. Running the BAT in a terminal returned prerequisite exit 10. The checkout's
   Python 3.14.7 environment lacked `sqlcipher3`; frozen browser assets passed
   exact-source verification. Ordinary pip dependencies do not include the
   locally built native encryption wheel, so their successful installation did
   not complete runtime setup.
2. The already approved development wheel was copied from the original
   `D:/DEV/soma-beta` checkout, verified against the recorded SHA-256
   `ae151e020ce45b60aac8be3fc8628ae4a7894b2c543fbfb5bc1f4047db22618f`, and
   installed offline with no dependency resolution into this checkout's `.venv`.
   Keyed ephemeral SQLCipher/profile and frozen-asset checks passed.
3. The next run returned exit 31: a stale canonical runtime registry recorded
   PID 17956, now belonging to VS Code with a different process creation time.
   No other SOMA host was found. Following user authorization, the registry was
   revalidated under exclusive Foundation instance ownership and renamed to
   `runtime.stale-f538da6b-0817-4c54-b0b7-d0536bb18c16.json` in the same protected
   runtime directory. Existing database, keys and credential artifacts were
   preserved. VS Code was left running.
4. This checkout started an authenticated READY host and opened its verified
   browser origin. A second invocation verified and reused the same host.
   The host was intentionally left running for the user.

Code changes retain failure output with a pause and preserve exit codes;
`--no-pause` supports automation. Prerequisite messages identify missing driver,
cipher verification and asset verification separately without exposing captured
subprocess stderr. Automatic stale-registry cleanup was not introduced.

## Dependency and code findings

Advisory queries were executed only after explicit user approval to disclose
package names and versions. OSV checked 29 installed third-party Python packages.
Its two pytest records are aliases for one vulnerability, CVE-2025-71176.
`npm audit` reported zero known vulnerabilities for the frontend lockfile.
Neither result covers undisclosed vulnerabilities or statically linked native
libraries.

| Finding | Exposure and required follow-up |
| --- | --- |
| pytest 8.4.2: CVE-2025-71176 / GHSA-6w46-j5rx-g56g | Moderate local temporary-directory issue documented for Unix. Test-only dependency; the described exploit is not applicable to this Windows runtime. Patched in 9.0.3, outside the current `<9` constraint. Upgrade the test dependency contract and validate the suite before using shared Unix test hosts; use a private test directory meanwhile. |
| Approved SQLCipher wheel embeds OpenSSL 3.6.0 | Published OpenSSL advisories affect this version, including high-severity CMS parsing CVE-2025-15467. SQLCipher here uses AES-CBC/HMAC-SHA512; the review did not establish a reachable CMS/TLS/QUIC attack path. This is a vulnerable component finding, not proof of a SOMA exploit. Rebuild and verify the approved SQLCipher artifact against patched OpenSSL (3.6.5 addresses the published September advisories), then update artifact evidence through the owning process. The accepted wheel hash was not rewritten. |
| Python development setup lacks a complete hash lock | Direct runtime packages are version-pinned, but transitive packages, build dependencies and test dependencies resolve through ranges; pip setup does not enforce hashes. This reduces repeatability and supply-chain assurance. Produce a reviewed complete dependency lock and offline verified release bundle before release. |
| Startup logs have no rotation/pruning | Detached starts create owner-only logs with no implemented retention bound. Repeated failed starts can accumulate files. Implement the owned diagnostic rotation/sanitization contract before release; protected ACLs alone do not provide retention or sanitization. |

Sources:

- [pytest advisory](https://github.com/advisories/GHSA-6w46-j5rx-g56g)
- [OpenSSL 3.6 advisories](https://openssl-library.org/news/vulnerabilities-3.6/index.html)

Focused code review covered launcher prerequisite checks, process/registry trust,
run authentication, browser session/CSRF/Host checks, password validation,
encrypted connection verification and basic unsafe-code patterns. No additional
confirmed remotely exploitable defect was established in that limited review.
That is not a whole-repository security audit.

## Verification and limits

- Focused launcher, authentication, control/trust, SQLCipher and native lifecycle
  suite: **85 passed, 1 skipped** in 44.21 seconds. The skipped browser test needs
  its repository Node/Playwright and native Edge prerequisites.
- One native asset test initially failed because it referenced obsolete hashed
  bundle names. The verified manifest and successful asset integrity check
  established that the test was stale. It now tests actual manifest JS/CSS files,
  exact bytes/digests, unauthenticated assets and escaped-path rejection.
- `pip check`, full Python compilation, frozen asset verification, schema
  verification (1321 objects) and `git diff --check` passed.
- The complete Python suite and wheel build were not run for these tooling/test
  changes. No runtime schema or migration bytes changed.
- Exact base-head remote implementation CI was in progress when inspected; no
  remote green result is claimed for these uncommitted changes.
- Initial tool sandbox startup failed before project commands could run; checks
  used reviewed execution outside that sandbox. An intermediate test run used a
  missing temporary parent and failed during fixture setup; the recorded final
  run used a fresh checkout-local directory.
