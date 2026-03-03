"""
DealHunter — Módulo de Distribuição
Publica ofertas nos grupos WhatsApp e Telegram "Sempre Black".
"""

from .message_formatter import MessageFormatter
from .affiliate_links import AffiliateLinkBuilder
from .shlink_client import ShlinkClient
from .telegram_bot import TelegramBot
from .whatsapp_notifier import WhatsAppNotifier

__all__ = [
    "MessageFormatter",
    "AffiliateLinkBuilder",
    "ShlinkClient",
    "TelegramBot",
    "WhatsAppNotifier",
]
