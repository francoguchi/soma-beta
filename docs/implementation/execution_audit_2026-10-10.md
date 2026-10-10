# Execution, correctness and performance audit

Audit base: `d0eb97c5f39b84f1d4057a69fa1e3e37653ccdbe`, branch
`feat/beta-ui-v2`. Accepted design remains
`9a0e891127a771251afccca1a281b7ef7dde9e5f`.
This records a repository audit and development execution evidence; it is not
whole-product, native-release or every-LLD semantic certification.

## Findings repaired

| Finding | Repair and executable evidence |
| --- | --- |
| Connection-close errors could poison a reusable writer thread's UoW context and writer-admission accounting; read snapshots could expose a closed handle. | Detach connection references before closing and always release the logical UoW context/admission in nested cleanup. Preserve rollback failure classification. Five new failure injections failed before repair, then passed. |
| Failed DB-API close incorrectly decremented open-connection/transaction metrics and disabled close retry. Host cleanup could release security and instance ownership with an open keyed connection. | Only count a connection as closed after successful driver close. Retain host run security/registry/lock while fresh metrics show any open connection/transaction. Two additional failure cases demonstrated both defects before repair; explicit close plus cleanup retry reaches STOPPED. |
| SLA catalog, policy, mapping, classification and report queries expanded complete filtered histories before slicing a page; some also loaded tiers or report detail per discarded row. | Query-local validated keyset predicates and page+lookahead SQL bounds share a small LLD-06 helper. Full filtered counts remain separate and in the same snapshot. Preserve complete composite keys, ascending/descending order, filter fingerprints, child evidence, diagnostic privilege and result fields. Bound nested expansion to selected rows. |
| Product Line presentation paging materialized and sorted the complete population and recomputed Unicode keys. | Stream through the accepted Unicode normalizer once per row and keep only page+lookahead using a bounded heap. The database scan remains necessary without a governed stored presentation-key index; Unicode semantics are unchanged. |
| Customer/contact candidate matching materialized complete ID sets before paging. | Use exact SQL candidate unions, full counts and bounded ID pages. Preserve account-code precedence/conflict explanations, deduplication, active-only scope, Customer/UNBOUND affiliation isolation and matching-profile refusal. Validate continuation UUIDs and bounds before candidate reads. |
| FK verification repeatedly loaded the same index structure for different FKs. | Reuse index columns only within one table and one verification invocation. Still inspect every FK and execute planner/collation/partial-predicate checks. Later invocations see dropped/changed indexes afresh; no global cache or skipped integrity checks. |
| Setup replay/conflicting/configured attempts repeated Argon2 before Foundation replay resolution. | Validate exact password/confirmation bytes, resolve immutable replay first, and perform expensive preparation only for a new eligible setup. Writer revalidation, receipt/result/audit atomicity and the fixed credential verifier remain unchanged. Native tests verify one setup receipt/audit and zero repeated hashes. The subsequently accepted V2 fingerprint repair is detailed below. |
| Fragmented HTTP bodies incurred repeated immutable-byte concatenation. | Accumulate into bytearray, check the existing bound before extending, and convert once for strict parsing. Preserve the 4 KiB auth/control and 256 KiB outer domain limits and owning stricter limits. Fragmented UTF-8, exact-bound and early-oversize cases execute the actual ASGI handler. |
| All hidden workbench tabs mounted immediately and fetched owner data before use. | Mount a tab on first use and retain visited tabs for the same store. Initial hidden Notes/Devices/Tasks/RFC evidence is not fetched; returning to a visited tab does not discard drafts, accepted query state or pane state. Real-browser tests cover initial request paths, one read per visited tab and unsaved draft preservation. |
| The wheel omitted brand SVGs named in the frozen manifest, preventing packaged SourceApplication startup. | Add `static/brand/*.svg` to package data. Actual wheel resource verification failed before the fix and passed afterward. The extracted wheel itself then booted an encrypted host and completed authenticated reads/browser login/React mounting. |
| Installed pytest 8.4.2 and its allowed dependency range included the published temporary-directory vulnerability. | Pin and install pytest 9.0.3, the documented patched version; validate the complete suite and dependency consistency. The approved wheel SHA-256 is `2c5efc453d45394fdd706ade797c0a81091eccd1d6e4bccfcd476e2b8e0ab5d9`. |
| A communications failure browser test expected a removed placeholder and returned ticket detail for a Devices query. | Supply a genuine bounded Device Reference fixture and assert selection remains usable while communications fail; no product behavior was weakened to satisfy the old assertion. |

Cursor versions now reject booleans, and keyset integer bindings outside the
database ordering range fail validation instead of raising a driver overflow.
No accepted migration, schema object, normalization profile, credential KDF,
domain identity, command result or audit history was rewritten.

## Authority and audit coverage

Read the current-state/continuation instructions, refreshed implementation/design
heads and CI, and ran implementation-state check/validation. The declared state
requires review and is navigation evidence, not renewed certification. Its
historical Foundation directory pattern must not be confused with the actual
pinned `spec/lld/foundation-runtime` packet.

The changed paths were checked against:

- LLD-01 index/module map, connection/UoW, strict JSON, technology and shutdown
  contracts. Mandatory per-connection key/cipher/pragma verification and WAL
  policy remain intact. Cleanup retains ownership when termination/closure is
  unproven.
- LLD-02 index/module map and exact reference-matching algorithm. Matching remains
  pure candidate evidence, never identity mutation or descriptive merging.
- LLD-06 index/module map and catalog/SLA/reporting query leaves. Exact totals,
  complete sort keys, snapshot ownership and completed-report evidence are kept.
- LLD-10 index/module map, technology, workbench shell and responsive state
  preservation. Lazy mounting adds no client mutation/authorization authority.
- LLD-12 index, setup ordering, auth DTO/password algorithm and existing security
  review and the owner-accepted V2 fingerprint refinement. Password/session/run/DEK
  and authentication-fingerprint roles stay separate; the base pin is unchanged.

Every application Python module was parsed and imported: **470 modules**, with
zero import failures. Compilation includes application, tests and tools. A
whole-source unsafe-primitive scan found no application `eval`, `exec`, pickle
load or archive extract-all calls. Manual review focused on production
composition, transport/admission, connection/transaction/replay/cleanup,
candidate/query expansion, immutable import capture and archive bounds,
communication retention, packaged resources and browser query/state behavior.
Passing these checks is not proof of every domain transition or arbitrary
adversarial input; the full owner regression suite supplies additional evidence.

## Measured work

One SQLite test fixture used **5,000 Contracts created through the owning
commands**. Both implementations returned the same continuation IDs and total.
With tracemalloc enabled, 12 repeated three-row continuation reads measured:

| Measurement | Inspected Git baseline | Audited code |
| --- | ---: | ---: |
| Median Contract page | 39.237 ms | 9.800 ms |
| Peak Python allocation | 3,482,280 bytes | 12,068 bytes |
| FK verification SQL statements per invocation | 2,235 | 1,337 |
| Median FK verification, five repeats | 28.047 ms | 22.116 ms |

This is a local fixture comparison, not a universal latency guarantee or native
SQLCipher load test. Exact counts still require database work over the filtered
population. Some query orders need database sorting under the immutable current
index allocation; no unapproved index migration was introduced.

Clean encrypted-host startup profiling reduced SQL execute calls from **10,723
to 8,927**. Wall time was **2.568 versus 2.577 seconds**, so no overall startup
speedup is claimed. Migration DDL, verified keyed connections and file work
dominate that clean-start path. A separate extracted-wheel run under concurrent
test load took 4.0 seconds; it is execution evidence, not a comparable benchmark.

## Verification

- Baseline Python: **2,206 passed, 1 skipped**, 710.95 s.
- Intermediate Python: **2,215 passed, 1 skipped**, 671.58 s.
- Patched-pytest broad run before the last two cleanup regressions:
  **2,223 passed, 5 subtests passed**, 698.95 s. The exact cached Node 24.21.0
  toolchain enabled the formerly skipped real Edge login test.
- Complete cleanup checkpoint: **2,225 passed, 5 subtests passed, no skips**, 684.75 s,
  including the two final close/ownership regressions and native Edge login.
  Log: `tmp/audit-complete-final.log`.
- Final focused Foundation close/lifecycle/status: **31 passed**, 19.51 s.
- Strict TypeScript and frontend unit tests: **48 passed**; frozen Vite build used
  the exact CI Node **24.21.0** and existing locked dependencies.
- Final browser suite: **162 passed**, 15.5 s, including lazy query/draft tests.
- Source and extracted-wheel hosts each performed first-run setup, **18
  authenticated API reads** covering composed domains, real browser password
  login, React mounting, JS/CSS verification and normal shutdown. These fixtures
  used isolated encrypted instances, not canonical user credentials/data.
- Fresh wheel and exact migration/schema/registry/Unicode/static-resource checks
  passed. Cleanup checkpoint artifact (superseded by the V2 wheel below):
  `dist/execution-audit/soma_beta-1.0.0.dev0-py3-none-any.whl`, SHA-256
  `a8fbce977dca31aa680b813b470906cabbaa85e8e6ca39dc95aaf81388429e47`.
  At that checkpoint, all **469 packaged Python modules** matched source bytes; all
  three brand SVGs are present and no DPAPI/private runtime/dependency directory
  was packaged. That checkpoint recorded 1,007 source/test/tool/
  dependency/workflow/resource hashes with aggregate
  `77503ae0ec8a6f594e0419a516de069869258e00e73b2c61b101b5aac90af9a9`.
- Release schema **1,321 objects**, **19 immutable migrations**;
  Communications **100 structural scenario bindings**; private-sample exclusion,
  implementation-state structural validation, compileall, pip check and diff
  whitespace checks passed. None of these is independent semantic certification.
- Explicitly authorized advisory scans: OSV **29 installed Python packages,
  zero findings** after the pytest patch; npm lockfile **zero known advisories**.
  These do not cover embedded native libraries or undisclosed vulnerabilities.

## Accepted security repair and residual historical risk

A separate synthetic, read-only check proved that a decrypted setup receipt
permits password-guess testing with SHA-256 and **zero Argon2 calls**. This is not
an unauthenticated HTTP disclosure: obtaining decrypted receipts is a prerequisite.
SQLCipher/DPAPI/owner ACLs still protect acquisition, but the receipt becomes a
fast verifier if those contents are obtained. The user's credential and canonical
database were not inspected for this check.

The concrete owning refinement is
[`LLD12_AUTH_REQUEST_FINGERPRINT_PROPOSAL_V2.md`](../reconciliation/LLD12_AUTH_REQUEST_FINGERPRINT_PROPOSAL_V2.md).
The owner accepted implementation with **"please continue"** on 2026-10-10.
New setup commands use `AUTH_COMMAND_HMAC_SHA256_V2` with an independent random
32-byte CurrentUser-DPAPI key and a purpose-bound canonical HMAC. Foundation's
outer request hash, immutable receipts/results, migrations and Argon2 credential
profile are unchanged. Exact V1/V2 replay resolves before Argon2 and mutable
eligibility reads. V1 compatibility never executes a new V1 mutation.

New native regressions cover database-only guessing resistance, secret exclusion,
key/DEK/reset separation, exact/changed V1 and V2 replay, lost key after restart,
DPAPI/installation/purpose/ACL/length tampering, ownership loss, confirmation,
publication verification failure, rollback/orphan reuse, unavailable results,
and real encrypted same-installation snapshot/restore with preserved key/receipt
bytes. A Foundation-owned existence probe prevents missing-key regeneration even
when credential state is unavailable but setup history remains. Ordinary login
and the DEK stay independent of fingerprint-key loss.

Historical V1 exposure remains under the accepted preservation policy: no silent
password rotation, receipt rewrite/deletion or operational-data reset. V2 prevents
future fast-oracle receipts, not retroactive guessing against old receipts.

The earlier linked OpenSSL 3.6.0 finding led to a separately built and verified
OpenSSL 3.6.5 source-development artifact, preserving binding 0.6.2 and SQLCipher
core 4.17.0. The original artifact and historical metadata are preserved; new setup
uses a separate versioned artifact/pin and prerequisites reject the old provider.
Installed-driver and final-suite verification are recorded in the V2 checkpoint
below. This is source-development remediation, not release certification.
No reachable CMS/TLS/QUIC exploit was established in SOMA's page-encryption path.
The exact native artifact embeds SQLite 3.53.3; the FTS5 CVEs listed by the
[SQLite project's current table](https://sqlite.org/cves.html) were fixed in 3.53.2.
Complete transitive
hash locking and diagnostic sanitization/retention remain release work. Native
PFF golden-corpus gates and broader uncomposed owner transports/working-copy
registrations remain existing product limits, not invented features in this audit.

## Workspace, package and runtime notes

Generated UI assets were already locally changed at task start. Their exact
pre-audit directory is preserved under `tmp/audit-ui-static-before/static`.
The new build incorporates current browser sources and the audit changes.
Existing generated `build/` contained obsolete hashed assets; it was inspected
and moved, after verifying both absolute paths are inside this checkout, to
`tmp/audit-build-cache-before`. A clean wheel exposed the missing-SVG defect above
and then passed after its package rule was repaired. No user data was deleted.

The authorized canonical host was gracefully stopped and restarted to load the
audited runtime/frozen UI. Repeat Run verified and reused the existing READY
instance. Database, protected keys and credentials were preserved; no reset was
performed. Isolated audit instances were stopped normally.

No audit commit or push has been performed. Exact base-head remote CI run
[38079631161](https://github.com/francoguchi/soma-beta/actions/runs/38079631161)
was inspected; its frontend failed the committed frozen-build diff gate. The
source/asset repair is verified locally, but that earlier run cannot certify
these uncommitted files. Windows Python 3.13 and Ubuntu execution of this final
audit diff remain unverified locally. No merge, promotion or history rewrite.

Sources for the dependency/native findings:
[pytest advisory](https://github.com/advisories/GHSA-6w46-j5rx-g56g) and
[OpenSSL 3.6 advisories](https://openssl-library.org/news/vulnerabilities-3.6/index.html).

## Patched native development candidate build phase

An isolated candidate now builds `sqlcipher3/0.6.2` and the unchanged official
SQLCipher 4.17.0 amalgamation against static OpenSSL **3.6.5**, official tag commit
`c8bd5a57108599ac650bbae77fcabe3109dab2e8`. All 26 captured binding/core source
files and the previously accepted setup macros were verified unchanged. The
Windows `/MD` configuration follows the cached recipe's runtime selection; an
initial legacy-provider DLL linker failure was repaired by applying `/MD` to its
generated DSO compile flags and recompiling that single object. The final native
build and offline wheel build both returned exit 0.

The candidate wheel SHA-256 is
`4e1a8b5a580b94a015b50c566092db6178a095d0d206371e133155e164517c3c`.
Exact inputs, configuration, hashes, checks and limits are recorded in
[candidate evidence](lld12_native_security_candidate_2026-10-10.json).
Runtime inspection reported `4.17.0 community` and
`OpenSSL 3.6.5 29 Sep 2026`; PE imports require no OpenSSL DLL. Six existing native
cases passed against the extracted candidate, including encrypted migration 19,
wrong-key rejection, setup/replay/rollback, registry/trust, browser assets and
owned shutdown. A separate application-wheel live probe completed first setup,
18 authenticated read paths, real Edge login and React mounting, then graceful
shutdown. Its observed startup was 2.527 seconds, not a comparative benchmark.

A database created earlier by the installed driver was read under Foundation
ownership using the candidate. Integrity, foreign keys and all 19 migrations
verified; the synthetic database and protected-key bytes were unchanged. No user
database or credential was inspected. At that candidate phase it was **not installed** and the launcher pin was unchanged.
The later source-development adoption uses a distinct pin/artifact, preserves the
previous bytes and claims no release certification. Its focused native evidence does not substitute for
the full source-suite results recorded above. OpenSSL upstream tests, Python 3.13,
Ubuntu and the clean-user release matrix still require separate execution before
release freeze/adoption.
