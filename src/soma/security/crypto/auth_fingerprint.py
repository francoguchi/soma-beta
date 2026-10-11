"""Installation-bound authentication fingerprints; no key enters SQLite."""
import hashlib
import hmac
from pathlib import Path
import secrets

from soma.foundation.errors import SecurityNotReady
from soma.foundation.strict_json import canonical_json_bytes_bounded
from soma.security.runtime.control import publish_owned_file, read_owned_file
from soma.security.runtime.windows import reject_redirects


AUTH_FINGERPRINT_PROFILE = "AUTH_COMMAND_HMAC_SHA256_V2"
_PURPOSE = "auth_command_fingerprint"


class AuthenticationFingerprintKey:
    def __init__(self, root, installation_id, *, ownership_assertion, file_security, dpapi):
        self.path = Path(root) / "security" / "auth-command-fingerprint.dpapi"
        self.installation_id = installation_id
        self.ownership, self.files, self.dpapi = ownership_assertion, file_security, dpapi

    def load(self):
        if not self.ownership():
            raise SecurityNotReady("authentication fingerprint requires instance ownership")
        try:
            path = reject_redirects(self.path)
            self.files.verify(path.parent)
            if not path.exists():
                return None
            secret = self.dpapi.unprotect_current_user(
                read_owned_file(path, self.files), _PURPOSE, self.installation_id)
            if not isinstance(secret, bytes) or len(secret) != 32:
                raise SecurityNotReady("authentication fingerprint key length is invalid")
            return secret
        except OSError:
            raise SecurityNotReady("authentication fingerprint key is unavailable") from None

    def prepare_new_setup(self):
        """Caller must first prove no replay and unconfigured first-run state.

        Retain a valid key after database rollback. An orphan carries no command
        authority, but reusing it keeps future preparation stable across retries.
        """
        existing = self.load()
        if existing is not None:
            return existing
        secret = secrets.token_bytes(32)
        protected = self.dpapi.protect_current_user(secret, _PURPOSE, self.installation_id)
        try:
            publish_owned_file(self.path, protected, self.files)
        except OSError:
            raise SecurityNotReady("authentication fingerprint key publication failed") from None
        verified = self.load()
        if verified is None or not hmac.compare_digest(secret, verified):
            raise SecurityNotReady("authentication fingerprint key did not verify")
        return verified

    def setup_digest(self, secret, password_bytes):
        if not isinstance(secret, bytes) or len(secret) != 32:
            raise SecurityNotReady("authentication fingerprint key length is invalid")
        # PasswordVerifierProvider has validated the exact UTF-8 bytes, including
        # confirmation equality. The bound permits the worst JSON control escapes.
        message = canonical_json_bytes_bounded({
            "profile": AUTH_FINGERPRINT_PROFILE,
            "command_type": "SetupLocalAdmin",
            "target": {"type": "security_configuration", "id": self.installation_id},
            "password_utf8": password_bytes.decode("utf-8"),
        }, max_bytes=8192, max_depth=4, max_collection_items=8)
        return hmac.new(secret, b"SOMA-AUTH-COMMAND-FINGERPRINT-V2\0" + message, hashlib.sha256).hexdigest()
