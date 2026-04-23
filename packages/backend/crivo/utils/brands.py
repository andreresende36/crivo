"""
Crivo — Unified Brand Registry
Central list of known brands, pre-compiled regex, and extraction helper.

Used by: message_formatter, title_generator, score_engine, product_image_selector.
"""

import re

# ---------------------------------------------------------------------------
# Unified brand set (superset of all previous lists)
# ---------------------------------------------------------------------------

KNOWN_BRANDS: frozenset[str] = frozenset({
    # --- Moda & Calçados ---
    "Nike", "Adidas", "Puma", "Fila", "New Balance", "Asics", "Mizuno",
    "Under Armour", "Reebok", "Vans", "Olympikus", "Kappa",
    "Converse", "Lacoste", "Havaianas",
    # --- Moda Casual ---
    "Hering", "Insider", "Reserva", "Colcci", "Dumond", "Arezzo", "Lupo",
    "Calvin Klein", "Tommy Hilfiger", "Polo Ralph Lauren", "Levis",
    # --- Beleza ---
    "Natura", "O Boticário", "Boticário", "Avon",
    # --- Suplementos ---
    "Growth", "Max Titanium", "Integralmedica", "Atlhetica",
    # --- Eletrônicos ---
    "Samsung", "Xiaomi", "JBL", "Apple", "Motorola", "LG", "Sony", "Philips",
    # --- Eletrodomésticos ---
    "Tramontina", "Mondial", "Electrolux", "Brastemp", "Consul", "Arno",
    # --- Outros ---
    "Renner",
})

# Lowercase set for case-insensitive lookups without regex
KNOWN_BRANDS_LOWER: frozenset[str] = frozenset(b.lower() for b in KNOWN_BRANDS)

# Pre-compiled regex for extracting a known brand from a string
BRAND_REGEX: re.Pattern[str] = re.compile(
    r"\b(" + "|".join(re.escape(b) for b in sorted(KNOWN_BRANDS, key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)


def extract_brand(title: str) -> str | None:
    """
    Extract a known brand name from a product title.

    Returns the brand name preserving the original casing from the title,
    or None if no known brand is found.
    """
    match = BRAND_REGEX.search(title)
    return match.group(0) if match else None
