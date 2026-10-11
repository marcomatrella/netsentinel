"""Italian notification formatters and templates for NetSentinel alerts."""

from datetime import datetime
from typing import Any

from jinja2 import Template

HTML_INCIDENT_TEMPLATE = """<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .header { padding: 20px 24px; background: {% if is_resolved %}#065f46{% elif is_shift %}#854d0e{% else %}#9f1239{% endif %}; color: #ffffff; }
    .header h1 { margin: 0 0 4px 0; font-size: 18px; font-weight: 700; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: rgba(255,255,255,0.2); }
    .content { padding: 24px; font-size: 14px; line-height: 1.6; }
    .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; color: #94a3b8; margin: 18px 0 6px 0; letter-spacing: 0.05em; }
    .highlight-box { background: #0f172a; border-radius: 8px; padding: 14px; margin: 12px 0; border: 1px solid #334155; }
    .meta-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; }
    .meta-label { color: #94a3b8; }
    .meta-value { font-weight: 600; color: #f1f5f9; }
    ul { margin: 6px 0; padding-left: 20px; }
    li { margin-bottom: 4px; }
    .btn { display: inline-block; padding: 10px 20px; background: #0284c7; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 18px; text-align: center; }
    .footer { padding: 16px 24px; background: #0f172a; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="badge">{% if is_resolved %}Risolto{% elif is_shift %}Aggiornamento Incidente{% else %}Allarme NetSentinel{% endif %}</span>
      <h1>{{ title }}</h1>
    </div>
    <div class="content">
      <div class="highlight-box">
        <div class="meta-row"><span class="meta-label">🚨 Causa Radice:</span> <span class="meta-value">{{ root_cause_device_name }} ({{ root_cause_category }})</span></div>
        <div class="meta-row"><span class="meta-label">📊 Confidenza:</span> <span class="meta-value">{{ confidence_pct }}%</span></div>
        <div class="meta-row"><span class="meta-label">⏱️ Inizio:</span> <span class="meta-value">{{ started_at }}</span></div>
        {% if resolved_at %}
        <div class="meta-row"><span class="meta-label">✅ Durata totale:</span> <span class="meta-value">{{ duration_str }}</span></div>
        {% endif %}
      </div>

      <div class="section-title">🔍 Diagnosi e Motivo</div>
      <p>{{ summary }}</p>

      {% if impacted_devices %}
      <div class="section-title">⚠️ Nodi a valle impattati (Sintomi)</div>
      <ul>
        {% for d in impacted_devices %}
        <li><strong>{{ d.name }}</strong> ({{ d.kind }}) — Irraggiungibile o degradato per dipendenza</li>
        {% endfor %}
      </ul>
      {% endif %}

      {% if recommendations %}
      <div class="section-title">🛠️ Azioni Consigliate</div>
      <ul>
        {% for r in recommendations %}
        <li>{{ r }}</li>
        {% endfor %}
      </ul>
      {% endif %}

      <div style="text-align: center;">
        <a href="{{ dashboard_url }}" class="btn">Apri Dashboard NetSentinel</a>
      </div>
    </div>
    <div class="footer">
      NetSentinel — Sistema Intelligente di Monitoraggio Home Lab &bull; Vantage Point: {{ vantage_point_name }}
    </div>
  </div>
</body>
</html>
"""

TEXT_INCIDENT_TEMPLATE = """[NetSentinel {% if is_resolved %}RISOLTO{% elif is_shift %}AGGIORNAMENTO{% else %}ALLARME{% endif %}] {{ title }}
========================================================================

🚨 Causa Radice: {{ root_cause_device_name }} ({{ root_cause_category }})
📊 Livello di Confidenza: {{ confidence_pct }}%
⏱️ Iniziato: {{ started_at }}
{% if resolved_at %}✅ Risolto: {{ resolved_at }} (Durata: {{ duration_str }}){% endif %}

🔍 DIAGNOSI:
{{ summary }}

{% if impacted_devices %}
⚠️ NODI A VALLE IMPATTATI (SINTOMI):
{% for d in impacted_devices %}
 - {{ d.name }} ({{ d.kind }})
{% endfor %}
{% endif %}

{% if recommendations %}
🛠️ AZIONI CONSIGLIATE:
{% for r in recommendations %}
 - {{ r }}
{% endfor %}
{% endif %}

🔗 Dashboard: {{ dashboard_url }}
"""


def render_incident_notification(
    incident: dict[str, Any],
    root_cause_device: dict[str, Any] | None,
    impacted_devices: list[dict[str, Any]],
    dashboard_url: str = "http://netsentinel.local:8080",
    vantage_point_name: str = "Synology NAS",
    is_resolved: bool = False,
    is_shift: bool = False,
) -> tuple[str, str, str]:
    """Render subject, HTML body, and plain-text body for an incident notification."""
    dev_name = root_cause_device.get("name", "Rete locale") if root_cause_device else (incident.get("root_cause_device_id") or "Infrastruttura")
    conf_pct = int(float(incident.get("confidence", 0.9)) * 100)

    # Subject line
    prefix = "[NetSentinel RISOLTO]" if is_resolved else ("[NetSentinel AGGIORNAMENTO]" if is_shift else "[NetSentinel ALLARME]")
    subject = f"{prefix} {incident.get('summary', 'Anomalia rilevata')[:60]} ({dev_name})"

    # Calculate duration
    started_at = incident.get("started_at", "")
    resolved_at = incident.get("resolved_at", "")
    duration_str = ""
    if started_at and resolved_at:
        try:
            t0 = datetime.fromisoformat(str(started_at).replace("Z", "+00:00"))
            t1 = datetime.fromisoformat(str(resolved_at).replace("Z", "+00:00"))
            delta = t1 - t0
            mins = int(delta.total_seconds() // 60)
            duration_str = f"{mins} minuti" if mins > 0 else f"{int(delta.total_seconds())} secondi"
        except Exception:
            duration_str = "N/D"

    ctx = {
        "title": "Incidente Risolto" if is_resolved else ("Spostamento Causa Radice" if is_shift else "Nuovo Incidente Rilevato"),
        "root_cause_device_name": dev_name,
        "root_cause_category": incident.get("root_cause_category", "infrastruttura"),
        "confidence_pct": conf_pct,
        "started_at": str(started_at),
        "resolved_at": str(resolved_at) if is_resolved else None,
        "duration_str": duration_str,
        "summary": incident.get("summary", ""),
        "impacted_devices": impacted_devices,
        "recommendations": incident.get("recommendations", []),
        "dashboard_url": dashboard_url,
        "vantage_point_name": vantage_point_name,
        "is_resolved": is_resolved,
        "is_shift": is_shift,
    }

    html_content = Template(HTML_INCIDENT_TEMPLATE).render(ctx)
    text_content = Template(TEXT_INCIDENT_TEMPLATE).render(ctx)
    return subject, html_content, text_content

