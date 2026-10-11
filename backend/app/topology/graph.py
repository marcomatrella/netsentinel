"""Topology graph representation, path finding and dependency analysis using NetworkX."""

import networkx as nx
from app.db.models import Dependency, Device, Link


class TopologyGraph:
    """In-memory directed graph representing devices, physical links, and logical dependencies."""

    def __init__(self, vantage_point_id: str | None = None) -> None:
        self.vantage_point_id = vantage_point_id
        # Directed graph: edge (A, B) means 'A depends on B'
        self.dep_graph = nx.DiGraph()
        # Physical network graph for distance / hop count from vantage point
        self.phys_graph = nx.Graph()

        self._devices: dict[str, Device] = {}
        self._links: dict[str, Link] = {}
        self._dependencies: dict[str, Dependency] = {}

    def load_from_db_entities(
        self,
        devices: list[Device],
        links: list[Link],
        dependencies: list[Dependency],
        vantage_point_id: str | None = None,
    ) -> None:
        """Populate graph from database entity records."""
        self.vantage_point_id = vantage_point_id or self.vantage_point_id
        self.dep_graph.clear()
        self.phys_graph.clear()
        self._devices.clear()
        self._links.clear()
        self._dependencies.clear()

        # Add devices as nodes
        for dev in devices:
            self._devices[dev.id] = dev
            self.dep_graph.add_node(dev.id, device=dev)
            self.phys_graph.add_node(dev.id, device=dev)

        # Add physical links
        for link in links:
            self._links[link.id] = link
            self.phys_graph.add_edge(
                link.from_device_id,
                link.to_device_id,
                link_id=link.id,
                medium=link.medium,
                poe=link.poe,
                status=link.status,
            )

        # Add dependencies: edge (dependent, provider)
        for dep in dependencies:
            self._dependencies[dep.id] = dep
            self.dep_graph.add_edge(
                dep.dependent_id,
                dep.provider_id,
                dep_id=dep.id,
                kind=dep.kind,
                strength=dep.strength,
                source=dep.source,
                reason=dep.reason,
            )

    def get_device(self, device_id: str) -> Device | None:
        """Retrieve cached device entity."""
        return self._devices.get(device_id)

    def get_upstream_providers(self, device_id: str, kind: str | None = None) -> list[str]:
        """Get immediate upstream providers that device_id depends on."""
        if device_id not in self.dep_graph:
            return []
        providers = []
        for _, provider_id, data in self.dep_graph.out_edges(device_id, data=True):
            if kind is None or data.get("kind") == kind:
                providers.append(provider_id)
        return providers

    def get_all_upstream_ancestors(self, device_id: str) -> set[str]:
        """Get all transitive upstream providers (ancestors) in the dependency tree."""
        if device_id not in self.dep_graph:
            return set()
        return nx.descendants(self.dep_graph, device_id)

    def get_downstream_dependents(self, provider_id: str, kind: str | None = None) -> list[str]:
        """Get immediate nodes that depend on provider_id."""
        if provider_id not in self.dep_graph:
            return []
        dependents = []
        for dependent_id, _, data in self.dep_graph.in_edges(provider_id, data=True):
            if kind is None or data.get("kind") == kind:
                dependents.append(dependent_id)
        return dependents

    def get_all_downstream_impacted(self, provider_id: str) -> set[str]:
        """Get all transitive downstream nodes that depend on provider_id."""
        if provider_id not in self.dep_graph:
            return set()
        return nx.ancestors(self.dep_graph, provider_id)

    def get_path_from_vantage_point(self, device_id: str) -> list[str]:
        """Compute shortest network hop path from vantage point to target device."""
        if not self.vantage_point_id or self.vantage_point_id not in self.phys_graph:
            return [device_id]
        if device_id not in self.phys_graph:
            return [device_id]

        try:
            return nx.shortest_path(self.phys_graph, source=self.vantage_point_id, target=device_id)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return [device_id]

    def get_distance_from_vantage_point(self, device_id: str) -> int:
        """Number of network hops from vantage point (infinity if unreachable)."""
        if not self.vantage_point_id or device_id == self.vantage_point_id:
            return 0
        path = self.get_path_from_vantage_point(device_id)
        if len(path) <= 1 and path[0] != self.vantage_point_id:
            return 999
        return len(path) - 1

    def find_cycles(self) -> list[list[str]]:
        """Identify dependency cycles."""
        try:
            return list(nx.simple_cycles(self.dep_graph))
        except Exception:
            return []
