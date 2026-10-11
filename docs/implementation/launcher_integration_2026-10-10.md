# Reference launcher integration

Requested by the user on 2026-10-10. Current branch is `feat/beta-ui-v2`, base
HEAD `8adafa3387c917a0642289bd5e57c0f4dbad4619`. Existing troubleshooting edits
were preserved. Implementation and verification preceded the user's later
explicit commit/push request; no merge or history rewrite was performed.

Read-only reference: `D:/DEV/soma`, branch `feat/01-identity-reference`, observed
HEAD `0a5fe80`. Inspected all five BAT files, its source launcher, runtime
observation/control and development database rebuild. Its `src/core`/`src/main`
layout, runtime registry, generation/seed model and package contracts differ
from Beta; those implementation details were not copied as Beta authority.

The accepted design pin remains `9a0e891127a771251afccca1a281b7ef7dde9e5f`.
Foundation runtime/module ownership and its migration, lock, encrypted connection,
identity query and consistent snapshot providers are reused. Security retains
browser/run credential separation and trusted-instance verification. The user's
request authorizes an explicit source-development reset utility, implemented
under `tools/`, without introducing a product reset command or HTTP transport.

## Adaptation

| Reference behavior | Integration into this branch |
| --- | --- |
| Five source buttons | Added `soma_reset_dev.bat`; retained Run, Console, Setup and Stop. |
| Visible console/run failure | Both pause on failure and retain the original exit status; `--no-pause` supports automation. |
| Console opens/reuses verified origin | Fresh foreground startup, existing host and losing concurrent console starts open only after fresh authenticated READY proof. Owned prepublication startup can wait within the existing 30-second budget. Unexpected server exit is an error, not successful shutdown. |
| Explicit dead-run cleanup in Stop | Proves native process absence/termination, protected paths, exact registry/credential bytes, CurrentUser DPAPI purpose/installation binding, encrypted database identity and exclusive existing instance lock. Only exact-owned registry/credential files are removed. Reused/live PIDs and untrusted/unknown artifacts remain protected. |
| Confirmed development rebuild | Displays canonical source instance and requires literal RESET before stopping anything. Builds/verifies a fresh encrypted database with all 19 unchanged migrations, preserves an encrypted consistent snapshot including WAL content, checkpoints both databases, and atomically replaces one database under the Foundation lock. Leaves host stopped and administrator setup empty. Installation/key files and unrelated artifacts are preserved. |
| Setup builds frontend | Added explicit `soma_setup.bat --build-ui`, using the branch's CI-pinned Node 24.21.0, locked npm install and existing build/typecheck/manifest commands. Ordinary setup continues to verify frozen assets without Node. Runtime commands do not install or rebuild. Reference contract/impact generators and incompatible seed contributors are not imported. |

Database/lock files legitimately inherit current-user/SYSTEM permissions from
their protected data directory. A narrowly scoped data-file verifier accepts
exactly those principals and full-control permissions, rejects reparse points
and hardlinks, and verifies the protected parent. Credential-file verification
continues to require protected per-file ACLs. Native tests demonstrate that
ordinary broad/inherited foreign ACLs are rejected.

Reset snapshots are local encrypted development retention files under
`data/dev-reset-<uuid>/previous.soma.db`, not portable SOMA backup sets. Reading
them requires the retained installation/live-key files. There is no automatic
snapshot pruning or restore UX. Failure preserves staging/snapshot evidence for
review; the single atomic database replacement leaves either the old database
or the fully migrated replacement. No migrations, schema manifests, production
owner routes, domain workflows or frozen frontend bytes were changed.

## Verification

- Complete Python suite during integration: **2172 passed, 1 skipped**, 690.36s.
  That run began before the final console-convergence/error-reporting refinements;
  it is supplemented by final focused verification below, not claimed as an
  immutable final-source certification.
- Final affected launcher/reset/native ACL/trust/control/application suite:
  **98 passed, 1 skipped**, 46.18s. Covered literal/EOF cancellation before any
  stop, stop timeout refusal, live-lock refusal, encrypted old-state retention,
  empty/new data identity and all 19 migrations, first setup after reset,
  build-failure preservation, invalid DPAPI/database identity/live PID refusal,
  exact dead-run cleanup/idempotency, console reuse/convergence, unexpected server
  exit and inherited-data versus strict credential ACLs.
- The browser-login test was skipped because its exact repository
  Node/Playwright/native Edge prerequisites were unavailable. Authenticated HTTP
  and actual browser-opening launch paths were exercised separately.
- Actual BAT smoke: console reuse, stop, repeated stop, ordinary setup, detached
  start/reuse, reset cancellation, fresh console READY/browser opening, graceful
  foreground stop, detached restart and console reuse all passed. Reset with
  RESET was tested only on isolated instances; canonical user data was not reset.
- Final wheel build/resource verification passed; both modified packaged runtime
  modules matched current source bytes. Wheel SHA-256:
  `6bd7ca5cb33cb788fa94e3492abf8fe57d80bdbea6474530ac22cbfd118b38e1`.
- Full compilation, `pip check`, frozen assets, schema verification (1321 objects),
  private-artifact exclusion and `git diff --check` passed.
- Optional frontend rebuild was unit-tested for exact commands and wrong-version
  refusal, but not executed: installed Node is 24.19.0, while CI pins 24.21.0.
- Continuation check returned review-required (exit 2), including dirty changes;
  unchanged historical scope is not renewed certification. No remote CI result
  is claimed for these unpublished edits.

Only this checkout's source host was intentionally left running. The reference
checkout was not edited. Dependency findings from the preceding security review
(including the native OpenSSL build) remain recorded separately and were not
silently repinned during this integration.

## Follow-up: double-click Stop/Reset visibility

The user reported that Stop and Reset could not be run by double-clicking in this
branch's folder. Terminal reproduction completed three real start/stop cycles:
each Stop returned success, the exact host PID was terminated, its TCP listener
was closed and its runtime registry was removed. No backend shutdown failure was
reproduced. Both BAT files previously exited immediately after printing their
result, making their output disappear on double-click.

Both now preserve the exit code and pause after the final result (success or
failure). `--no-pause` suppresses only that final pause; it cannot authorize or
skip Reset's destructive confirmation. Real BAT execution from another working
directory verified Stop success and Reset cancellation with visible results.
All 51 directly affected launcher/native control/development tests passed in
34.02 seconds. The canonical development data was not reset; SOMA was left
stopped after this follow-up. Browser tabs are not closed by host shutdown.

## Follow-up: background Run creates console windows

The user's screenshot showed a blank Windows Terminal window after background
Run. The observed old host's base Python process had a console host attached.
DETACHED_PROCESS was insufficient for the Windows venv redirector and captured
child prerequisite processes. Background startup now uses CREATE_NO_WINDOW with
CREATE_NEW_PROCESS_GROUP; captured Python/Node probes also use CREATE_NO_WINDOW
on Windows. Foreground/setup output and error pauses are retained.

The old host was stopped through trusted Stop and restarted with the corrected
flags. Native window enumeration found no SOMA-associated visible windows, and
the leftover Windows Terminal process was gone. An internal hidden conhost
process may exist; its presence alone does not indicate a visible window.
A native regression asserts GetConsoleWindow is null in the actual background
venv child, while other regressions check hidden flags on captured probes.
Final verification passed all 45 focused launcher/native lifecycle tests in
25.04 seconds, including the Node-probe flag extension. Final wheel/resource,
compilation and diff checks passed. No datastore or trust-protocol semantics
changed. The authenticated READY host was left running for the user.

The refreshed published-base CI run 38032900371 failed its frontend browser lane;
all three Python lanes succeeded. It did not test these uncommitted fixes.

## Final session publication validation

Before the user-requested commit/push, the complete final affected launcher,
development reset, native Windows ACL/trust/control and source-application suite
passed **102 tests, 1 skipped** in 48.55 seconds. The browser prerequisite skip
remains as described above. Wheel resources, all 19 migrations, 1321 schema
objects, frozen assets, compilation, dependency consistency, private-artifact
exclusion and diff checks passed. No additional runtime code changed after that
run. Remote HEAD was refreshed and matched local base HEAD before publication;
the earlier remote frontend failure is not a green result for this change.
