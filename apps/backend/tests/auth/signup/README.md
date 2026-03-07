# Signup

Tests for `POST /api/auth/signup`: register with email/password, Supabase user creation, Gitea user provisioning.

**Run:** `python test_signup.py` (from this dir or via `python tests/run_all.py`).  
**Pass:** HTTP 200, response includes `supabase` and `gitea` success.
