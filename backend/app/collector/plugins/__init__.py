"""Register built-in collector plugins."""

from app.collector.plugins.dns import DnsCollector
from app.collector.plugins.http import HttpCollector
from app.collector.plugins.ping import PingCollector
from app.collector.plugins.tcp_port import TcpPortCollector
from app.collector.registry import registry


def register_default_collectors() -> None:
    """Register all standard built-in collectors."""
    registry.register(PingCollector())
    registry.register(TcpPortCollector())
    registry.register(HttpCollector())
    registry.register(DnsCollector())


register_default_collectors()
