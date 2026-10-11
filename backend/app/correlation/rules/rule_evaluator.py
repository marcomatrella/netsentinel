"""Rule evaluator for topological diagnosis rules."""

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

        # Match by device kind and impact
        matched_rule = None
        for rule in self.rules:
            target_kinds = rule.get("target_kind", [])
            if "any" in target_kinds or candidate_device.kind in target_kinds:
                # Check specific conditions
                if candidate_device.kind == "router" and rule["id"] == "rule_02_gateway_down":
                    matched_rule = rule
                    break
                elif candidate_device.kind == "switch" and rule["id"] == "rule_06_switch_down":
                    matched_rule = rule
                    break
                elif candidate_device.kind in ["nas", "server"] and rule["id"] == "rule_07_nas_dhcp_dns_down":
                    matched_rule = rule
                    break
                elif candidate_device.kind == "access_point" and rule["id"] == "rule_04_ap_poe_loss":
                    matched_rule = rule
                    break
                elif candidate_device.kind == "ups" and rule["id"] == "rule_10_ups_on_battery":
                    matched_rule = rule
                    break

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
        confidence = float(matched_rule.get("confidence_base", 0.90))
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
