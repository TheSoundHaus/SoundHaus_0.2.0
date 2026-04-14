"""
Thin helpers for pgcrypto column-level encryption.

Usage:
    from services.crypto_service import pg_encrypt, pg_decrypt

    # Encrypt a value before INSERT/UPDATE:
    db.execute(text(
        "INSERT INTO my_table (secret_col) VALUES (pgp_sym_encrypt(:val, :key))"
    ), {"val": plaintext, "key": get_encryption_key()})

    # Decrypt on SELECT:
    row = db.execute(text(
        "SELECT pgp_sym_decrypt(secret_col, :key) AS secret FROM my_table WHERE id = :id"
    ), {"key": get_encryption_key(), "id": row_id}).first()
"""

from config import settings


def get_encryption_key() -> str:
    """Return the application encryption key. Raises if not configured."""
    key = settings.encryption_key
    if not key:
        raise RuntimeError(
            "ENCRYPTION_KEY is not set. Column-level encryption is unavailable."
        )
    return key


def pg_encrypt_expr(column_placeholder: str = ":val") -> str:
    """Return a SQL fragment for pgp_sym_encrypt."""
    return f"pgp_sym_encrypt({column_placeholder}::text, :_enc_key)"


def pg_decrypt_expr(column_name: str) -> str:
    """Return a SQL fragment for pgp_sym_decrypt."""
    return f"pgp_sym_decrypt({column_name}, :_enc_key)"
