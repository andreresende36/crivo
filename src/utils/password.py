"""
Crivo — Utilitários de senha
Hashing com bcrypt (salt automático, fator de custo 12).
"""

import bcrypt


def hash_password(plain: str) -> str:
    """Retorna o hash bcrypt da senha em formato string."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verifica se a senha plaintext corresponde ao hash armazenado."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
