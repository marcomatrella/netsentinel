"""Collector registry for dynamic plugin registration and discovery."""

import logging
from typing import Any

from app.collector.base import BaseCollector

logger = logging.getLogger("netsentinel.collector.registry")


class CollectorRegistry:
    """Registry maintaining active collector plugins."""

    def __init__(self) -> None:
        self._collectors: dict[str, BaseCollector] = {}

    def register(self, collector: BaseCollector) -> None:
        """Register a new collector instance."""
        if collector.name in self._collectors:
            logger.warning("Sovrascrittura del collector: %s", collector.name)
        self._collectors[collector.name] = collector
        logger.debug("Collector registrato: %s", collector.name)

    def get(self, name: str) -> BaseCollector | None:
        """Get collector by unique name."""
        return self._collectors.get(name)

    def list_all(self) -> list[dict[str, Any]]:
        """List metadata of all registered collectors."""
        return [
            {
                "name": col.name,
                "description": col.description,
                "capabilities": col.capabilities,
                "has_discovery": col.__class__.discover is not BaseCollector.discover,
            }
            for col in self._collectors.values()
        ]


# Singleton collector registry
registry = CollectorRegistry()
