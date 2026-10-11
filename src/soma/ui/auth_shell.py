"""Styled, CSP-nonced pre-authentication page; presentation only.

The Beta server owns authentication status, session cookies and credential
checking. This HTML never changes those contracts or delegates to React.
"""
from __future__ import annotations

import re


def render_auth_shell(nonce: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_-]{12,128}", nonce):
        raise ValueError("Invalid auth-shell CSP nonce")
    html = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SOMA · Local Administrator</title>
<link rel="icon" type="image/svg+xml" href="/static/ui/brand/soma-mark.svg">
<style nonce="SOMA_AUTH_NONCE">
:root{color-scheme:dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0f1115;color:#e6eaee}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;background:#0f1115}
main{min-height:100dvh;display:grid;place-items:center;padding:18px}
.auth-card{width:min(100%,430px);background:#181d25;border:1px solid #37404d;padding:30px 32px;box-shadow:0 22px 60px #0005}
.auth-card img{display:block;width:52px;height:52px;object-fit:contain;margin-bottom:24px}
.eyebrow{font:10px/1.6 Consolas,monospace;text-transform:uppercase;letter-spacing:.14em;color:#a3bbdf;margin:0 0 16px}
h1{font-size:23px;letter-spacing:-.02em;line-height:1.25;margin:0 0 16px;font-weight:700}
.intro{font-size:13px;line-height:1.65;color:#e1e7f0;margin:0 0 24px}
form{display:grid;gap:15px}label{display:grid;gap:7px;font-size:12px;line-height:1.4}
input{display:block;width:100%;height:44px;padding:0 12px;background:#0f131a;color:#eef4fa;border:1px solid #465365;border-radius:2px;font:inherit}
input:focus-visible,button:focus-visible{outline:2px solid #a4c2fa;outline-offset:2px}
button{min-height:37px;border:1px solid #4e85dd;background:#255ca5;color:white;font-weight:650;border-radius:2px;cursor:pointer}
button:disabled{opacity:.55;cursor:default}
.auth-foot{display:block;margin-top:25px;color:#a4b1c2;font-size:11px;line-height:1.75}
#error:not(:empty){padding:10px;border:1px solid #b86167;color:#ffacb2;background:#331d23;margin-top:16px;font-size:12px}
[hidden]{display:none!important}
@media(max-width:420px){.auth-card{padding:24px 20px}}
@media(forced-colors:active){.auth-card{border:1px solid CanvasText}input{border-color:CanvasText}button{border-color:ButtonText}#error:not(:empty){border-color:CanvasText}}
</style></head>
<body><main><section class="auth-card" aria-labelledby="title">
<img src="/static/ui/brand/soma-mark.svg" alt="SOMA">
<p class="eyebrow">Local operations / private instance</p>
<h1 id="title">Local Administrator</h1>
<p id="state" class="intro" role="status">Checking local authentication…</p>
<form id="auth" autocomplete="off">
<label for="password">Password<input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024"></label>
<label id="confirmation-label" for="confirmation" hidden>Confirm password<input id="confirmation" name="confirmation" type="password" autocomplete="new-password" maxlength="1024"></label>
<button type="submit" id="submit" disabled>Sign in</button>
</form><p id="error" role="alert"></p>
<small class="auth-foot">Single local administrator · Password recovery is not available in this development build.</small>
</section></main>
<script nonce="SOMA_AUTH_NONCE">
'use strict';
const form=document.getElementById('auth');
const password=document.getElementById('password');
const confirmation=document.getElementById('confirmation');
const error=document.getElementById('error');
const state=document.getElementById('state');
const submit=document.getElementById('submit');
let configured=null;
const friendly={AUTH_INVALID_CREDENTIALS:'Invalid credentials. Try again.',
AUTH_RATE_LIMITED:'Too many attempts. Try again later.',
AUTH_ALREADY_CONFIGURED:'This administrator has already been configured. Reload to sign in.',
AUTH_NOT_CONFIGURED:'First-run setup is required. Reload to continue.'};
fetch('/api/v1/auth/status',{credentials:'same-origin',redirect:'error'})
.then(async r=>{if(!r.ok)throw new Error('status');return r.json();})
.then(s=>{
 if(typeof s.configured!=='boolean')throw new Error('status');
 configured=s.configured;
 document.getElementById('title').textContent=configured?'Sign in to SOMA':'Set up Local Administrator';
 state.textContent=configured?'Enter your Local Administrator password.':'Create the password for this installation. Use at least 12 characters.';
 password.autocomplete=configured?'current-password':'new-password';
 password.minLength=configured?1:12;
 confirmation.required=!configured;
 confirmation.minLength=configured?0:12;
 document.getElementById('confirmation-label').hidden=configured;
 submit.textContent=configured?'Sign in':'Create password and sign in';
 submit.disabled=false;
 password.focus();
}).catch(()=>{state.textContent='Unable to verify the local authentication state. Reload SOMA to retry.';});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(configured===null||submit.disabled)return;
 error.textContent='';
 if(!configured&&(password.value.length<12||password.value!==confirmation.value)){
   error.textContent='Use at least 12 characters, and confirm the same password.';return;
 }
 submit.disabled=true;submit.textContent='Checking…';
 try{
  const body=configured?{password:password.value}:
    {command_id:crypto.randomUUID(),password:password.value,password_confirmation:confirmation.value};
  const r=await fetch('/api/v1/auth/'+(configured?'login':'setup'),{
    method:'POST',credentials:'same-origin',redirect:'error',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await r.json();
  if(!r.ok){error.textContent=friendly[result.code]||'Authentication could not be completed.';return;}
  password.value='';confirmation.value='';location.replace('/');
 }catch{error.textContent='The local host could not complete authentication.';}
 finally{submit.disabled=false;submit.textContent=configured?'Sign in':'Create password and sign in';}
});
</script></body></html>'''
    return html.replace("SOMA_AUTH_NONCE", nonce)
