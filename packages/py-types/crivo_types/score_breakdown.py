from pydantic import BaseModel, ConfigDict


class ScoreBreakdown(BaseModel):
    model_config = ConfigDict(extra="allow")

    discount: float = 0
    badge: float = 0
    rating: float = 0
    reviews: float = 0
    free_shipping: float = 0
    installments: float = 0
    title_quality: float = 0
