import json
from pathlib import Path
from typing import Any

import yaml
from app.db.models import Device
from pydantic import BaseModel, Field


class DiagnosisResult(BaseModel):
    """Result of evaluating diagnostic rules on a candidate root-cause device."""

    rule_id: str
    category: str
    confidence: float
    title: str
    summary: str
    recommendations: list[str] = Field(default_factory=list)
    alternative_hypotheses: list[dict[str, Any]] = Field(default_factory=list)


class RuleEvaluator:
    """Loads and evaluates declarative YAML diagnosis rules."""

    def __init__(self, rules_file: Path | None = None) -> None:
        self.rules: list[dict[str, Any]] = []
        if rules_file and rules_file.exists():
            self.load_rules(rules_file)
        else:
            default_path = Path(__file__).parent / "default_rules.yaml"
            if default_path.exists():
                self.load_rules(default_path)

    def load_rules(self, file_path: Path) -> None:
        """Parse rules from YAML file."""
        content = yaml.safe_load(file_path.read_text())
        if isinstance(content, dict) and "rules" in content:
            self.rules = content["rules"]

    def evaluate_candidate(
        self,
        candidate_device: Device,
        evidences: list[dict[str, Any]],
        downstream_impacted_count: int = 0,
        is_vantage_point_isolated: bool = False,
    ) -> DiagnosisResult:
        """Select best matching rule for the candidate device and calculate confidence."""
        # Special case: Vantage point isolated (Rule 11)
        if is_vantage_point_isolated:
            rule_11 = self._find_rule("rule_11_vantage_point_isolated")
            if rule_11:
                return self._build_result(rule_11, 0.95)

        # Special case: WAN Gateway failure (Rule 1)
        if candidate_device.kind == "wan_gateway":
            rule_01 = self._find_rule("rule_01_wan_loss")
            if rule_01:
                return self._build_result(rule_01, 0.95)

        # Match by device kind, evidence details, and impact
        matched_rule = None
        matched_confidence = None

        if candidate_device.kind == "access_point":
            # Discriminate the 4 AP offline scenarios (Section 6.4)
            has_reboot = any(
                "reboot" in str(e.get("message", "")).lower()
                or "riavvio" in str(e.get("message", "")).lower()
                or (e.get("details", {}).get("uptime_seconds", 99999) < 300)
                for e in evidences
            )
            has_controller_desync = any(
                e.get("check_type") == "unifi" and not e.get("positive")
                for e in evidences
            ) and any(
                e.get("check_type") in ["ping", "tcp_port"] and e.get("positive")
                for e in evidences
            )
            poe_down = any(
                ("poe" in str(e.get("message", "")).lower() and not e.get("positive"))
                or (e.get("details", {}).get("poe_power", 1.0) == 0.0 and not e.get("positive"))
                for e in evidences
            )
            poe_active = any(
                e.get("details", {}).get("poe_power", 0.0) > 0.0
                or ("poe attiva" in str(e.get("message", "")).lower() and e.get("positive"))
                for e in evidences
            )
            ip_down = any(
                e.get("check_type") in ["ping", "tcp_port"] and not e.get("positive")
                for e in evidences
            )

            if has_controller_desync:
                # Case D: Only controller disconnected, AP alive on network
                matched_rule = self._find_rule("rule_ap_controller_desync")
                matched_confidence = 0.92
            elif has_reboot:
                # Case A: AP reboot / watchdog / firmware upgrade
                matched_rule = self._find_rule("rule_03_ap_reboot")
                matched_confidence = 0.88
            elif poe_active and ip_down:
                # Case C: PoE power is ON, but IP/DHCP lease lost
                matched_rule = self._find_rule("rule_ap_ip_lease_loss")
                matched_confidence = 0.89
            elif poe_down:
                # Case B: PoE power loss / cable disconnected
                matched_rule = self._find_rule("rule_04_ap_poe_loss")
                matched_confidence = 0.95
            else:
                # Default AP failure with missing evidence recommendations
                matched_rule = self._find_rule("rule_04_ap_poe_loss")
                matched_confidence = 0.75

        elif candidate_device.kind == "router":
            matched_rule = self._find_rule("rule_02_gateway_down")
        elif candidate_device.kind == "switch":
            matched_rule = self._find_rule("rule_06_switch_down")
        elif candidate_device.kind in ["nas", "server"]:
            # Check if volume or service degraded
            has_storage_degraded = any(
                "storage" in str(e.get("message", "")).lower()
                or "disco" in str(e.get("message", "")).lower()
                or "smart" in str(e.get("message", "")).lower()
                for e in evidences
            )
            if has_storage_degraded:
                matched_rule = self._find_rule("rule_12_storage_degraded")
            else:
                matched_rule = self._find_rule("rule_07_nas_dhcp_dns_down")
        elif candidate_device.kind == "ups":
            matched_rule = self._find_rule("rule_10_ups_on_battery")
        elif candidate_device.kind == "smart_hub":
            cand_roles = []
            if hasattr(candidate_device, "roles_json") and candidate_device.roles_json:
                try:
                    cand_roles = json.loads(candidate_device.roles_json)
                except Exception:
                    pass
            elif hasattr(candidate_device, "roles") and candidate_device.roles:
                cand_roles = list(candidate_device.roles)
            if "passive_tracking" not in cand_roles:
                matched_rule = self._find_rule("rule_13_service_hang")

        if not matched_rule:
            # Fallback generic rule
            return DiagnosisResult(
                rule_id="rule_generic_failure",
                category="device_down",
                confidence=0.80,
                title=f"Guasto apparato: {candidate_device.name}",
                summary=f"L'apparato '{candidate_device.name}' ({candidate_device.kind}) risulta non raggiungibile dal monitor. Nessun nodo a monte è guasto.",
                recommendations=[
                    f"Controlla l'alimentazione e lo stato fisico di {candidate_device.name}.",
                    "Verifica il cavo di rete verso lo switch o router.",
                ],
                alternative_hypotheses=[],
            )

        # Calculate confidence boost based on downstream evidence
        confidence = float(
            matched_confidence if matched_confidence is not None else matched_rule.get("confidence_base", 0.90)
        )
        if downstream_impacted_count > 1:
            confidence = min(1.0, confidence + 0.05)

        return self._build_result(matched_rule, confidence)

    def _find_rule(self, rule_id: str) -> dict[str, Any] | None:
        """Find rule definition by ID."""
        for r in self.rules:
            if r.get("id") == rule_id:
                return r
        return None

    def _build_result(self, rule: dict[str, Any], confidence: float) -> DiagnosisResult:
        """Construct DiagnosisResult from rule dictionary."""
        return DiagnosisResult(
            rule_id=rule.get("id", "custom_rule"),
            category=rule.get("category", "hardware"),
            confidence=round(confidence, 2),
            title=rule.get("title", "Anomalia rilevata"),
            summary=rule.get("summary", ""),
            recommendations=rule.get("recommendations", []),
            alternative_hypotheses=rule.get("alternative_hypotheses", []),
        )
