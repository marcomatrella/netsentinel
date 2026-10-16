"""Automated dependency deduction engine based on topological drawing (Section 4.6)."""

import json

import networkx as nx
from app.db.models import Dependency, Device, Link
from app.schemas.entities import DependencyCreate

DEVICE_HIERARCHY_RANK: dict[str, int] = {
    "wan_gateway": 0,
    "router": 1,
    "firewall": 1,
    "modem": 1,
    "switch": 2,
    "poe_injector": 3,
    "access_point": 4,
    "nas": 5,
    "server": 5,
    "smart_hub": 5,
    "service": 5,
    "ups": 6,
    "printer": 7,
    "camera": 7,
    "nvr": 7,
    "smart_plug": 7,
    "sensor": 7,
    "client": 8,
    "custom": 7,
}


def _get_device_rank(dev: Device) -> int:
    """Return structural hierarchy rank for a device (lower number = closer to upstream root)."""
    roles = json.loads(dev.roles_json) if dev.roles_json else []
    if "wan_provider" in roles:
        return 0
    if "gateway" in roles:
        return 1
    return DEVICE_HIERARCHY_RANK.get(dev.kind, 7)


def deduce_dependencies_from_topology(
    devices: list[Device],
    links: list[Link],
    vantage_point_id: str | None = None,
    existing_manual_dependencies: list[Dependency] | None = None,
) -> list[DependencyCreate]:
    """Deduce dependency relationships from drawn network nodes and physical links (Section 4.6)."""
    dev_map = {d.id: d for d in devices}
    manual_deps = existing_manual_dependencies or []

    deduced_list: list[DependencyCreate] = []

    # Build physical hop graph
    phys_g = nx.Graph()
    for d in devices:
        phys_g.add_node(d.id)

    physical_mediums = {"ethernet", "poe", "wifi", "wan", "fiber"}
    for link in links:
        if link.medium in physical_mediums:
            phys_g.add_edge(link.from_device_id, link.to_device_id, link=link)

    # Calculate distance to upstream network root (WAN or Gateway/Router)
    root_nodes = [d.id for d in devices if _get_device_rank(d) <= 1]
    root_distances: dict[str, int] = {}
    for r_id in root_nodes:
        if r_id in phys_g:
            try:
                lens = nx.single_source_shortest_path_length(phys_g, r_id)
                for nid, dist in lens.items():
                    if nid not in root_distances or dist < root_distances[nid]:
                        root_distances[nid] = dist
            except Exception:
                pass

    # 1. Deduce from physical links (ethernet, poe, wifi, wan, power, logical)
    for link in links:
        src_id = link.from_device_id
        dst_id = link.to_device_id
        src_dev = dev_map.get(src_id)
        dst_dev = dev_map.get(dst_id)

        if not src_dev or not dst_dev:
            continue

        # Rule: Ethernet (Downstream device depends on Upstream device)
        if link.medium == "ethernet":
            rank_src = _get_device_rank(src_dev)
            rank_dst = _get_device_rank(dst_dev)

            if rank_src > rank_dst:
                # src is lower in hierarchy than dst (e.g. Switch vs Router, or NAS vs Switch)
                dep_dev, prov_dev = src_dev, dst_dev
            elif rank_dst > rank_src:
                # dst is lower in hierarchy than src
                dep_dev, prov_dev = dst_dev, src_dev
            else:
                # Equal rank (e.g. two switches): compare distance to network root (Gateway)
                d_src_root = root_distances.get(src_id, 999)
                d_dst_root = root_distances.get(dst_id, 999)
                if d_src_root > d_dst_root:
                    dep_dev, prov_dev = src_dev, dst_dev
                elif d_dst_root > d_src_root:
                    dep_dev, prov_dev = dst_dev, src_dev
                else:
                    # Fallback to link direction (from -> to)
                    dep_dev, prov_dev = dst_dev, src_dev

            dep_id = f"dep-l2-{dep_dev.id}-{prov_dev.id}"
            reason = f"Dedotta perché '{dep_dev.name}' è collegato via Ethernet a '{prov_dev.name}' lungo il percorso verso il Gateway/Core."
            deduced_list.append(DependencyCreate(
                id=dep_id,
                dependent_id=dep_dev.id,
                provider_id=prov_dev.id,
                kind="l2_path",
                strength="hard",
                source="inferred",
                reason=reason,
            ))

        # Rule: PoE (L2 path + power)
        elif link.medium == "poe":
            # Typically from injector/switch to powered device (destination)
            # Power dependency: destination depends on source for power
            dep_pow_id = f"dep-pow-{dst_id}-{src_id}"
            reason_pow = f"Dedotta perché '{dst_dev.name}' riceve alimentazione PoE da '{src_dev.name}'."
            deduced_list.append(DependencyCreate(
                id=dep_pow_id,
                dependent_id=dst_id,
                provider_id=src_id,
                kind="power",
                strength="hard",
                source="inferred",
                reason=reason_pow,
            ))
            # Also L2 path
            dep_l2_id = f"dep-l2-{dst_id}-{src_id}"
            reason_l2 = f"Dedotta perché '{dst_dev.name}' è collegato via PoE a '{src_dev.name}' lungo il percorso di rete."
            deduced_list.append(DependencyCreate(
                id=dep_l2_id,
                dependent_id=dst_id,
                provider_id=src_id,
                kind="l2_path",
                strength="hard",
                source="inferred",
                reason=reason_l2,
            ))

        # Rule: Power (e.g. UPS -> NAS)
        elif link.medium == "power":
            dep_id = f"dep-pow-{dst_id}-{src_id}"
            reason = f"Dedotta perché '{dst_dev.name}' è alimentato elettricamente da '{src_dev.name}'."
            deduced_list.append(DependencyCreate(
                id=dep_id,
                dependent_id=dst_id,
                provider_id=src_id,
                kind="power",
                strength="hard",
                source="inferred",
                reason=reason,
            ))

        # Rule: WAN / Fiber (Gateway -> WAN Provider)
        elif link.medium in ("wan", "fiber"):
            medium_label = "in Fibra Ottica" if link.medium == "fiber" else "WAN"
            # If src is wan_gateway and dst is router
            if src_dev.kind == "wan_gateway":
                dep_id = f"dep-wan-{dst_id}-{src_id}"
                reason = f"Dedotta perché '{dst_dev.name}' riceve accesso a Internet ({medium_label}) da '{src_dev.name}'."
                deduced_list.append(DependencyCreate(
                    id=dep_id,
                    dependent_id=dst_id,
                    provider_id=src_id,
                    kind="wan",
                    strength="hard",
                    source="inferred",
                    reason=reason,
                ))
            else:
                dep_id = f"dep-wan-{src_id}-{dst_id}"
                reason = f"Dedotta perché '{src_dev.name}' riceve accesso a Internet ({medium_label}) da '{dst_dev.name}'."
                deduced_list.append(DependencyCreate(
                    id=dep_id,
                    dependent_id=src_id,
                    provider_id=dst_id,
                    kind="wan",
                    strength="hard",
                    source="inferred",
                    reason=reason,
                ))

        # Rule: Wi-Fi (AP / Router -> Clients or Downstream AP)
        elif link.medium == "wifi":
            rank_src = _get_device_rank(src_dev)
            rank_dst = _get_device_rank(dst_dev)
            if rank_src > rank_dst:
                dep_dev, prov_dev = src_dev, dst_dev
            else:
                dep_dev, prov_dev = dst_dev, src_dev

            dep_id = f"dep-wifi-{dep_dev.id}-{prov_dev.id}"
            reason = f"Dedotta perché '{dep_dev.name}' è connesso via Wi-Fi a '{prov_dev.name}'."
            deduced_list.append(DependencyCreate(
                id=dep_id,
                dependent_id=dep_dev.id,
                provider_id=prov_dev.id,
                kind="l2_path",
                strength="hard",
                source="inferred",
                reason=reason,
            ))

        # Rule: Logical
        elif link.medium == "logical":
            dep_id = f"dep-srv-{src_id}-{dst_id}"
            reason = f"Relazione logica di servizio tra '{src_dev.name}' e '{dst_dev.name}'."
            deduced_list.append(DependencyCreate(
                id=dep_id,
                dependent_id=src_id,
                provider_id=dst_id,
                kind="service",
                strength="soft",
                source="inferred",
                reason=reason,
            ))

    # 2. Deduce from roles (gateway, dhcp_server, dns_resolver)
    for dev in devices:
        roles = json.loads(dev.roles_json) if dev.roles_json else []

        # Gateway role
        if "gateway" in roles:
            # All L2 devices depend on gateway for l3_gateway
            for other_dev in devices:
                if other_dev.id != dev.id and other_dev.kind not in ["wan_gateway"]:
                    dep_id = f"dep-gw-{other_dev.id}-{dev.id}"
                    reason = f"Dedotta perché '{other_dev.name}' usa '{dev.name}' come default gateway L3."
                    deduced_list.append(DependencyCreate(
                        id=dep_id,
                        dependent_id=other_dev.id,
                        provider_id=dev.id,
                        kind="l3_gateway",
                        strength="soft",
                        source="inferred",
                        reason=reason,
                    ))

        # DHCP Server role
        if "dhcp_server" in roles:
            for other_dev in devices:
                if other_dev.id != dev.id and other_dev.kind in ["client", "access_point", "smart_hub"]:
                    dep_id = f"dep-dhcp-{other_dev.id}-{dev.id}"
                    reason = f"Dedotta perché '{other_dev.name}' ottiene la configurazione IP dal server DHCP '{dev.name}'."
                    deduced_list.append(DependencyCreate(
                        id=dep_id,
                        dependent_id=other_dev.id,
                        provider_id=dev.id,
                        kind="dhcp",
                        strength="soft",
                        source="inferred",
                        reason=reason,
                    ))

        # DNS Resolver role
        if "dns_resolver" in roles:
            for other_dev in devices:
                if other_dev.id != dev.id and other_dev.kind in ["client", "access_point", "smart_hub"]:
                    dep_id = f"dep-dns-{other_dev.id}-{dev.id}"
                    reason = f"Dedotta perché '{other_dev.name}' usa il resolver DNS locale '{dev.name}'."
                    deduced_list.append(DependencyCreate(
                        id=dep_id,
                        dependent_id=other_dev.id,
                        provider_id=dev.id,
                        kind="dns",
                        strength="soft",
                        source="inferred",
                        reason=reason,
                    ))

    # 3. Filter out any deduced dependency that has been manually overridden
    final_list: list[DependencyCreate] = []
    seen_keys: set[tuple[str, str, str]] = set()

    # Re-insert manual dependencies first
    for m in manual_deps:
        if m.source == "manual":
            k = (m.dependent_id, m.provider_id, m.kind)
            seen_keys.add(k)
            final_list.append(DependencyCreate(
                id=m.id,
                dependent_id=m.dependent_id,
                provider_id=m.provider_id,
                kind=m.kind,
                strength=m.strength,
                source="manual",
                reason=m.reason or "Definita manualmente dall'utente",
            ))

    for d in deduced_list:
        k = (d.dependent_id, d.provider_id, d.kind)
        if k not in seen_keys:
            seen_keys.add(k)
            final_list.append(d)

    return final_list
