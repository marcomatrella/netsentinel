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


HTML_TEST_TEMPLATE = """<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .header { padding: 24px; background: linear-gradient(135deg, #065f46 0%, #047857 100%); color: #ffffff; text-align: left; }
    .header h1 { margin: 8px 0 0 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: rgba(255,255,255,0.25); letter-spacing: 0.05em; }
    .content { padding: 28px 24px; font-size: 14px; line-height: 1.6; }
    .success-card { background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .success-title { font-size: 15px; font-weight: 700; color: #34d399; margin: 0 0 6px 0; display: flex; align-items: center; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #94a3b8; margin: 20px 0 8px 0; letter-spacing: 0.06em; }
    .info-table { width: 100%; border-collapse: collapse; background: #0f172a; border-radius: 8px; overflow: hidden; border: 1px solid #334155; margin-bottom: 20px; }
    .info-table td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #1e293b; }
    .info-table tr:last-child td { border-bottom: none; }
    .info-label { color: #94a3b8; width: 40%; }
    .info-value { color: #f1f5f9; font-weight: 600; font-family: monospace; font-size: 12px; }
    .feature-list { background: #0f172a; border-radius: 8px; padding: 14px 16px 14px 28px; border: 1px solid #334155; margin-bottom: 24px; color: #cbd5e1; font-size: 13px; }
    .feature-list li { margin-bottom: 8px; }
    .feature-list li:last-child { margin-bottom: 0; }
    .feature-list strong { color: #f8fafc; }
    .btn-container { text-align: center; margin: 24px 0 8px 0; }
    .btn { display: inline-block; padding: 12px 28px; background: #0284c7; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3); }
    .footer { padding: 18px 24px; background: #0f172a; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #334155; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="badge">NetSentinel Test</span>
      <h1>Verifica Canale di Notifica Email</h1>
    </div>
    <div class="content">
      <div class="success-card">
        <div class="success-title">✓ Configurazione SMTP Verificata con Successo!</div>
        <div style="color: #e2e8f0; font-size: 13px;">
          Se stai leggendo questa email, i parametri del server SMTP, l'autenticazione e la lista dei destinatari sono correttamente impostati ed operativi.
        </div>
      </div>

      <div class="section-title">Parametri di Connessione Testati</div>
      <table class="info-table">
        <tr>
          <td class="info-label">Server SMTP Host</td>
          <td class="info-value">{{ host }}:{{ port }}</td>
        </tr>
        <tr>
          <td class="info-label">Crittografia</td>
          <td class="info-value">{{ security_mode }}</td>
        </tr>
        <tr>
          <td class="info-label">Utente Autenticato</td>
          <td class="info-value">{{ username }}</td>
        </tr>
        <tr>
          <td class="info-label">Indirizzo Mittente</td>
          <td class="info-value">{{ from_addr }}</td>
        </tr>
        <tr>
          <td class="info-label">Destinatari Notifiche</td>
          <td class="info-value">{{ to_addrs_str }}</td>
        </tr>
        <tr>
          <td class="info-label">Punto di Osservazione</td>
          <td class="info-value">{{ vantage_point_name }}</td>
        </tr>
        <tr>
          <td class="info-label">Data e Ora Invio</td>
          <td class="info-value">{{ timestamp }}</td>
        </tr>
      </table>

      <div class="section-title">Come Funzionano gli Avvisi di NetSentinel</div>
      <ul class="feature-list">
        <li><strong>Nessuna raffica di allarmi:</strong> quando un apparato cardine si spegne, NetSentinel correla la topologia e invia una sola email aggregata indicando la causa radice reale.</li>
        <li><strong>Silenziamento dei sintomi:</strong> tutti i dispositivi a valle che dipendono da esso vengono riconosciuti e non generano messaggi duplicati.</li>
        <li><strong>Notifica di rientro:</strong> al ripristino dell'anomalia, riceverai una conferma automatica con la durata complessiva del guasto.</li>
      </ul>

      <div class="btn-container">
        <a href="{{ dashboard_url }}" class="btn">Apri Dashboard NetSentinel</a>
      </div>
    </div>
    <div class="footer">
      NetSentinel — Sistema Intelligente di Monitoraggio Home Lab &bull; Versione {{ app_version }}<br>
      Punto di osservazione: {{ vantage_point_name }}
    </div>
  </div>
</body>
</html>
"""

TEXT_TEST_TEMPLATE = """[NetSentinel TEST] Verifica Canale di Notifica Email
========================================================================

✓ CONFIGURAZIONE SMTP VERIFICATA CON SUCCESSO!
Se stai leggendo questa email, i parametri del server SMTP, l'autenticazione
e i destinatari sono correttamente impostati ed operativi.

PARAMETRI DI CONNESSIONE TESTATI:
- Server SMTP: {{ host }}:{{ port }}
- Crittografia: {{ security_mode }}
- Utente: {{ username }}
- Mittente: {{ from_addr }}
- Destinatari: {{ to_addrs_str }}
- Punto di Osservazione: {{ vantage_point_name }}
- Data e Ora Invio: {{ timestamp }}

COME FUNZIONANO GLI AVVISI:
- Riceverai una sola email aggregata per incidente con causa radice identificata.
- I nodi a valle impattati vengono silenziati evitando raffiche di spam.
- Al termine riceverai un messaggio automatico con la durata totale dell'incidente.

Dashboard: {{ dashboard_url }}
========================================================================
NetSentinel - Sistema Intelligente di Monitoraggio Home Lab (v{{ app_version }})
"""


def render_test_notification(
    smtp_config: dict[str, Any],
    vantage_point_name: str = "Host NetSentinel",
    dashboard_url: str = "http://localhost:8080",
    app_version: str = "0.1.0",
) -> tuple[str, str, str]:
    """Render subject, polished HTML body, and plain-text body for a test notification email."""
    host = smtp_config.get("host", "localhost")
    port = smtp_config.get("port", 587)
    use_tls = smtp_config.get("use_tls", False)
    start_tls = smtp_config.get("start_tls", True)
    if use_tls:
        sec = "SSL/TLS (Porta 465)"
    elif start_tls:
        sec = "STARTTLS (Porta 587)"
    else:
        sec = "Nessuna (Connessione in chiaro)"

    username = smtp_config.get("username") or "Nessuna autenticazione"
    from_addr = smtp_config.get("from_addr", "netsentinel@local")
    to_addrs = smtp_config.get("to_addrs", [])
    if isinstance(to_addrs, list):
        to_addrs_str = ", ".join(to_addrs)
    else:
        to_addrs_str = str(to_addrs)

    now_str = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    subject = "[NetSentinel TEST] Verifica configurazione notifiche email"

    ctx = {
        "host": host,
        "port": port,
        "security_mode": sec,
        "username": username,
        "from_addr": from_addr,
        "to_addrs_str": to_addrs_str,
        "vantage_point_name": vantage_point_name,
        "timestamp": now_str,
        "dashboard_url": dashboard_url,
        "app_version": app_version,
    }

    html_content = Template(HTML_TEST_TEMPLATE).render(ctx)
    text_content = Template(TEXT_TEST_TEMPLATE).render(ctx)
    return subject, html_content, text_content


