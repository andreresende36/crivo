"""
Crivo — Title Examples
Dataclasses para o sistema de feedback de títulos.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TitleExampleData:
    """Dados para salvar um exemplo de título no banco."""

    product_title: str
    generated_title: str
    final_title: str
    action: str  # "approved" | "edited" | "timeout"
    category: str = ""
    price: float = 0.0
    scored_offer_id: str | None = None

    def to_dict(self) -> dict:
        return {
            "product_title": self.product_title,
            "generated_title": self.generated_title,
            "final_title": self.final_title,
            "action": self.action,
            "category": self.category or None,
            "price": self.price or None,
            "scored_offer_id": self.scored_offer_id,
        }


@dataclass
class TitleExample:
    """Exemplo carregado do banco para injeção few-shot no prompt."""

    product_title: str
    final_title: str
    action: str

    @classmethod
    def from_dict(cls, data: dict) -> TitleExample:
        return cls(
            product_title=data["product_title"],
            final_title=data["final_title"],
            action=data["action"],
        )
