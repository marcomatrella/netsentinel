from app.collector.plugins.adguard_home import AdGuardHomeCollector
from app.collector.plugins.asuswrt import AsusWrtCollector
from app.collector.plugins.dns import DnsCollector
from app.collector.plugins.fritzbox import FritzBoxCollector
from app.collector.plugins.generic_http_json import GenericHttpJsonCollector
from app.collector.plugins.home_assistant import HomeAssistantCollector
from app.collector.plugins.http import HttpCollector
from app.collector.plugins.mikrotik import MikroTikCollector
from app.collector.plugins.netgear import NetgearCollector
from app.collector.plugins.nut import NutCollector
from app.collector.plugins.omada import OmadaCollector
from app.collector.plugins.opnsense import OpnsenseCollector
from app.collector.plugins.pfsense import PfSenseCollector
from app.collector.plugins.ping import PingCollector
from app.collector.plugins.snmp import SnmpCollector
from app.collector.plugins.snmp_bridge import SnmpBridgeCollector
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
    registry.register(FritzBoxCollector())
    registry.register(OmadaCollector())
    registry.register(MikroTikCollector())
    registry.register(SnmpBridgeCollector())
    registry.register(OpnsenseCollector())
    registry.register(PfSenseCollector())
    registry.register(AsusWrtCollector())
    registry.register(NetgearCollector())
    registry.register(SynologyDsmCollector())
    registry.register(NutCollector())
    registry.register(AdGuardHomeCollector())
    registry.register(SnmpCollector())
    registry.register(HomeAssistantCollector())
    registry.register(GenericHttpJsonCollector())


register_default_collectors()
