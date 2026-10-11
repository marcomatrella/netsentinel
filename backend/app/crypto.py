"""Secret encryption and decryption at rest using Fernet."""

import base64
import os
from pathlib import Path

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from app.config import settings

_fernet_instance: Fernet | None = None


def get_encryption_key() -> bytes:
    """Retrieve or generate the symmetric encryption key."""
    if settings.secret_key:
        raw = settings.secret_key.encode("utf-8")
        if len(raw) == 44 and b"=" in raw:
            try:
                base64.urlsafe_b64decode(raw)
                return raw
            except Exception:
                pass
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"netsentinel_salt_v1",
            iterations=100_000,
        )
        return base64.urlsafe_b64encode(kdf.derive(raw))

    key_file = Path(settings.data_dir) / "secret.key"
    if key_file.exists():
        return key_file.read_bytes().strip()

    new_key = Fernet.generate_key()
    try:
        key_file.write_bytes(new_key)
        os.chmod(key_file, 0o600)
    except OSError:
        pass
    return new_key


def get_fernet() -> Fernet:
    """Get or create singleton Fernet instance."""
    global _fernet_instance
    if _fernet_instance is None:
        _fernet_instance = Fernet(get_encryption_key())
    return _fernet_instance


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a plaintext secret returning base64 urlsafe string."""
    if not plaintext:
        return ""
    return get_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    """Decrypt a ciphertext secret returning original plaintext."""
    if not ciphertext:
        return ""
    try:
        return get_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except Exception:
        # If decryption fails, return as-is (e.g. during migration or unencrypted fallback)
        return ciphertext


def mask_secret(value: str) -> str:
    """Mask a secret value for safe UI display or logs."""
    if not value:
        return ""
    if len(value) <= 6:
        return "******"
    return f"{value[:2]}...{value[-2:]}"
