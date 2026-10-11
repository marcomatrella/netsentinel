from app.collector.plugins.adguard_home import AdGuardHomeCollector
from app.collector.plugins.dns import DnsCollector
from app.collector.plugins.generic_http_json import GenericHttpJsonCollector
from app.collector.plugins.home_assistant import HomeAssistantCollector
from app.collector.plugins.http import HttpCollector
from app.collector.plugins.nut import NutCollector
from app.collector.plugins.ping import PingCollector
from app.collector.plugins.snmp import SnmpCollector
from app.collector.plugins.synology_dsm import SynologyDsmCollector
from app.collector.plugins.tcp_port import TcpPortCollector
from app.collector.plugins.unifi import UniFiCollector
from app.collector.registry import registry


def register_default_collectors() -> None:
    """Register all standard built-in collectors."""
    registry.register(PingCollector())
    registry.register(TcpPortCollector())
    registry.register(HttpCollector())
    registry.register(DnsCollector())
    registry.register(UniFiCollector())
    registry.register(SynologyDsmCollector())
    registry.register(NutCollector())
    registry.register(AdGuardHomeCollector())
    registry.register(SnmpCollector())
    registry.register(HomeAssistantCollector())
    registry.register(GenericHttpJsonCollector())


register_default_collectors()
