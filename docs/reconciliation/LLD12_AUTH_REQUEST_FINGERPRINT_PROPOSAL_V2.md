# Accepted authentication command fingerprint refinement

Status: **accepted session refinement; implemented; verification in progress**.
Acceptance: on 2026-10-10, after the linked V2 repair was presented for acceptance
or explicit deferral, the owner replied **"please continue"**. This authorizes
implementation of that repair. The base design pin remains unchanged.
Design examined: `9a0e891127a771251afccca1a281b7ef7dde9e5f`.
Owning contracts: LLD-12 `commands/v2/setup-local-admin.json`,
`types/auth.json`, `algorithms/password-auth.json`,
`algorithms/dpapi-protection.json`; LLD-01
`commands/execute-authoritative-command.json` and
`algorithms/strict-json.json`.

## Confirmed issue and exposure

Source setup currently replaces the password with
`SHA256("SOMA-SETUP-PASSWORD-V1" || NUL || password_utf8)` in the semantic
envelope. Foundation persists the canonical envelope request hash. An attacker
who obtains the decrypted receipt and its target fields can reconstruct that
hash for guesses with SHA-256 alone, bypassing Argon2's cost. The plaintext
password and PHC verifier are absent from the receipt, but the nested hash still
acts as a fast password-guessing oracle.

An isolated encrypted audit instance demonstrated that two known synthetic
candidates identify the fixture password with **zero Argon2 calls**. No user
credential or canonical database was examined. HTTP does not expose the receipt;
the demonstrated prerequisite is access to decrypted database contents. SQLCipher
and Windows ownership/DPAPI protections remain barriers to obtaining those bytes.

## Accepted V2 behavior

1. Under verified Foundation instance ownership, LLD-12 generates a distinct
   random 32-byte authentication-command fingerprint key. Protect it with
   CurrentUser DPAPI, an explicit new `auth_command_fingerprint` purpose and the
   existing installation-id entropy binding. Store it only in
   `security/auth-command-fingerprint.dpapi` using exact owner/SYSTEM ACLs,
   protected same-parent publication and reread/unwrap verification. It is never
   the DEK, reset secret, session/run credential or portable-backup key.
2. Validate password bounds and exact confirmation equality before fingerprinting.
   Compute HMAC-SHA-256 over a purpose-separated canonical object containing
   command type, target type/id and exact password UTF-8 value. The raw key and
   plaintext object remain bounded transient LLD-12 memory and never enter
   Foundation/audit/diagnostic interfaces.
3. The new semantic envelope names profile `AUTH_COMMAND_HMAC_SHA256_V2` and
   carries only its purpose-bound digest. Foundation still computes the exact
   canonical SHA-256 request hash and persists the ordinary immutable result.
   The public request/response, command name and receipt ordering do not change.
4. A committed V2 replay resolves before Argon2 or mutable eligibility reads.
   New setup retains the existing fixed Argon2 verifier profile and one outer
   writer UoW with profile/credential/receipt/result/audit atomicity.
5. For historical V1 setup receipts, permit the exact original V1 envelope only
   as a read-only committed-replay compatibility candidate. Both candidates must
   bind the same command/type/target. A miss never authorizes mutation; new
   commits use V2 only. Conflicts and unavailable/corrupt results keep Foundation's
   existing errors. Never rewrite/delete/backfill accepted receipts or migrations.
6. Loss or invalid ownership/DPAPI binding of a required existing V2 key must
   fail closed; never silently regenerate it for an installation with V2
   history. Same-installation backup/restore retains its external security root.
   A different installation remains a different setup command target. Exact
   restore/key-loss behavior must be covered before accepting this refinement.

## Historical exposure and acceptance

V2 prevents **future** fast-oracle receipts. It cannot erase V1 exposure while
preserving append-only historical receipts. Existing installations must receive
an explicit owner-approved credential rotation/legacy-risk policy. Do not reset
operational data, delete receipts or silently rotate the user's password. A
source-development reset remains separately and literally confirmed by its
existing maintenance workflow; it is not a production security repair.

Acceptance must cover key purpose separation and ACL/DPAPI tamper, key loss,
first-commit rollback/orphans, same/changed V1 and V2 replay, replay without
Argon2, plaintext/verifier/key exclusion, database-only guessing resistance,
cross-installation targets and restore compatibility. Keep the existing command
receipt schema, accepted migrations and credential KDF bytes unchanged.

The historical policy is to preserve accepted receipts and the current password,
retain exact V1 replay compatibility, and explicitly record the residual V1
exposure. No silent credential rotation, database reset or receipt deletion is
authorized. V2 protects future commits; it cannot retroactively protect V1 hashes.

## Implementation details within the accepted scope

New semantic payloads contain `fingerprint_profile` and `password_hmac_sha256`.
The HMAC message uses `SOMA-AUTH-COMMAND-FINGERPRINT-V2` plus NUL and bounded
Foundation-canonical JSON with profile, command type, installation target and
the exact UTF-8 password. The byte limit is 8192, depth 4, collection count 8;
this permits worst-case escaping of the accepted password bounds. Confirmation
is validated before any fingerprint/key operation. Foundation's outer hash,
receipt/result schemas and authoritative execute/replay rules are unchanged.
Both the fingerprint and Argon2 verifier consume the same validated password
capture; protected-file preparation never causes a later reread of a mutable
caller-owned password/confirmation DTO. A mutation-during-preparation regression
failed before this repair and then passed with the complete native auth cases.

LLD-12's `crypto/auth_fingerprint.py` owns protected-file/key/HMAC preparation;
`services/auth.py` owns eligibility and V1/V2 replay. The helper is an owned
crypto implementation addition, not alternate command authority. The key is
generated lazily before a genuinely new first setup, outside its writer UoW.
Successful rollback leaves its verified protected envelope for a stable retry.

Foundation provides a read-only `has_committed_command_target` existence probe
so the consumer never accesses Foundation's receipt table. It runs only before
generating an absent key, after replay miss and unconfigured-state validation.
Any setup history then forbids regeneration. This uses `LIMIT 1`, materializes
no history, and introduces no migration; no supporting target index is invented.

An exact V1 receipt can replay without a V2 key. If the key is absent, a V2
receipt cannot match the V1 candidate and returns Foundation's existing
`IDEMPOTENCY_CONFLICT`; no key or credential is generated. Invalid existing key
ACL, framing, purpose, installation binding, length or DPAPI content fails with
`SECURITY_NOT_READY`. Key loss does not disable the independent Argon2 login or
DEK; it denies setup fingerprint/replay authority. Same-installation restore
preserves the external security root/key and immutable replay result. A different
installation binds a different target and key. Full portable recovery remains
subject to its existing owning contract and composition limits.
