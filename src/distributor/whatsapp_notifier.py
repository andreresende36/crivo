"""
DealHunter — WhatsApp Notifier
Publica ofertas nos grupos WhatsApp via Evolution API.
Documentação: https://doc.evolution-api.com/v2/pt/send-message/send-text

Evolution API é um wrapper open-source para WhatsApp Business.
Alternativa: usar n8n como intermediário para desacoplar a integração.
"""

import asyncio
import time
from typing import Optional

import httpx
import structlog

from src.config import settings
from .message_formatter import FormattedMessage

logger = structlog.get_logger(__name__)


class WhatsAppNotifier:
    """
    Publica mensagens nos grupos WhatsApp "Sempre Black" via Evolution API.

    Inclui rate limiting configurável para evitar bloqueio pelo WhatsApp.

    Uso:
        notifier = WhatsAppNotifier()
        results = await notifier.publish(formatted_message)
    """

    def __init__(self):
        self.cfg = settings.whatsapp
        self._sent_timestamps: list[float] = []

    async def _wait_for_rate_limit(self) -> None:
        """Aguarda se necessário para respeitar o limite de msgs/minuto."""
        max_per_min = self.cfg.max_messages_per_minute
        now = time.monotonic()

        # Remove timestamps com mais de 60s
        self._sent_timestamps = [
            ts for ts in self._sent_timestamps if now - ts < 60
        ]

        if len(self._sent_timestamps) >= max_per_min:
            oldest = self._sent_timestamps[0]
            wait_time = 60 - (now - oldest) + 0.5
            if wait_time > 0:
                logger.info("whatsapp_rate_limit_wait", seconds=round(wait_time, 1))
                await asyncio.sleep(wait_time)
                now = time.monotonic()
                self._sent_timestamps = [
                    ts for ts in self._sent_timestamps if now - ts < 60
                ]

    async def publish(
        self,
        message: FormattedMessage,
        group_ids: Optional[list[str]] = None,
    ) -> list[dict]:
        """
        Publica a oferta em todos os grupos WhatsApp configurados.

        Returns:
            Lista de resultados por grupo
        """
        if not self.cfg.api_url or not self.cfg.api_key:
            logger.warning("whatsapp_not_configured")
            return []

        targets = group_ids or self.cfg.group_ids
        results = []

        async with httpx.AsyncClient(timeout=15.0) as client:
            for group_id in targets:
                await self._wait_for_rate_limit()
                result = await self._send_to_group(client, group_id, message)
                results.append(result)
                self._sent_timestamps.append(time.monotonic())

                if len(targets) > 1:
                    await asyncio.sleep(self.cfg.send_delay)

        return results

    async def _send_to_group(
        self,
        client: httpx.AsyncClient,
        group_id: str,
        message: FormattedMessage,
    ) -> dict:
        """Envia mensagem para um grupo WhatsApp específico."""
        result = {"group_id": group_id, "success": False}

        try:
            if message.image_url:
                response = await self._send_with_image(client, group_id, message)
            else:
                response = await self._send_text(client, group_id, message)

            response.raise_for_status()
            result["success"] = True
            result["data"] = response.json()
            logger.info(
                "whatsapp_sent",
                group_id=group_id,
                product_ml_id=message.product_ml_id,
            )

        except httpx.HTTPStatusError as exc:
            logger.error(
                "whatsapp_http_error",
                group_id=group_id,
                status=exc.response.status_code,
                detail=exc.response.text[:200],
            )
            result["error"] = f"HTTP {exc.response.status_code}"

        except Exception as exc:
            logger.error("whatsapp_error", group_id=group_id, error=str(exc))
            result["error"] = str(exc)

        return result

    async def _send_text(
        self,
        client: httpx.AsyncClient,
        group_id: str,
        message: FormattedMessage,
    ) -> httpx.Response:
        """Envia mensagem de texto simples."""
        url = f"{self.cfg.api_url}/message/sendText/{self.cfg.instance_name}"
        payload = {
            "number": group_id,
            "text": message.whatsapp_text,
        }
        return await client.post(url, json=payload, headers=self._headers())

    async def _send_with_image(
        self,
        client: httpx.AsyncClient,
        group_id: str,
        message: FormattedMessage,
    ) -> httpx.Response:
        """Envia mensagem com imagem do produto."""
        url = f"{self.cfg.api_url}/message/sendMedia/{self.cfg.instance_name}"
        payload = {
            "number": group_id,
            "mediatype": "image",
            "media": message.image_url,
            "caption": message.whatsapp_text,
        }
        return await client.post(url, json=payload, headers=self._headers())

    def _headers(self) -> dict:
        return {
            "apikey": self.cfg.api_key,
            "Content-Type": "application/json",
        }

    async def test_connection(self) -> bool:
        """Verifica se a Evolution API está acessível."""
        if not self.cfg.api_url:
            return False
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.cfg.api_url}/instance/fetchInstances",
                    headers=self._headers(),
                )
                return response.status_code == 200
        except Exception as exc:
            logger.error("whatsapp_connection_error", error=str(exc))
            return False
