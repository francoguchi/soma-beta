"""Presentation evidence for the pre-authentication SOMA shell."""
import re
import pytest

from soma.ui.auth_shell import render_auth_shell


def test_styled_auth_shell_preserves_beta_login_and_first_run_contracts():
    html = render_auth_shell("abcDEF0123_-nonce456")
    assert '<main>' in html and 'class="auth-card"' in html
    assert "Set up Local Administrator" in html
    assert "Sign in to SOMA" in html
    assert "password_confirmation" in html
    assert "command_id:crypto.randomUUID()" in html
    assert "'/api/v1/auth/status'" in html
    assert "'login':'setup'" in html
    assert 'type="password"' in html
    assert 'maxlength="1024"' in html
    assert 'minLength=configured?1:12' in html
    assert "src=\"/static/ui/brand/soma-mark.svg\"" in html
    assert 'href="/static/ui/brand/soma-mark.svg"' in html
    assert html.count('nonce="abcDEF0123_-nonce456"') == 2
    assert "location.replace('/')" in html
    assert "SOMA_AUTH_NONCE" not in html


@pytest.mark.parametrize("nonce", ["", "not allowed!", "<script>", "a" * 200])
def test_csp_nonce_rejects_untrusted_markup(nonce):
    with pytest.raises(ValueError, match="nonce"):
        render_auth_shell(nonce)
