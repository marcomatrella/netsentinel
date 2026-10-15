/**
 * Localization helper for diagnostic rules, incident titles, summaries, and What-If simulations.
 */

export const TITLE_TO_RULE_ID: Record<string, string> = {
  'Connessione Internet non disponibile (Guasto linea o ISP)': 'rule_01_wan_loss',
  'Gateway di rete offline (Spento o bloccato)': 'rule_02_gateway_down',
  'Access Point riavviato di recente': 'rule_03_ap_reboot',
  'Access Point offline per perdita alimentazione o cavo scollegato': 'rule_04_ap_poe_loss',
  'Cablaggio di rete instabile o velocità negoziata ridotta': 'rule_05_cable_flapping',
  'Switch principale non raggiungibile (Tutti i nodi a valle isolati)': 'rule_06_switch_down',
  'NAS offline: Servizi DNS, DHCP e storage interrotti': 'rule_07_nas_dhcp_dns_down',
  'Servizio DNS non risponde o upstream SERVFAIL': 'rule_08_dns_degraded',
  'Servizio DHCP fermo o pool di indirizzi esaurito': 'rule_09_dhcp_failure',
  'Mancanza di rete elettrica: UPS su batteria': 'rule_10_ups_on_battery',
  'Il monitor (Vantage Point) è isolato dalla rete': 'rule_11_vantage_point_isolated',
  'Avviso preventivo: Rischio guasto disco o volume degradato': 'rule_12_storage_degraded',
  'Host operativo ma servizio applicativo (es. Home Assistant) non risponde': 'rule_13_service_hang',
  'Aggiornamento firmware o riavvio di manutenzione': 'rule_14_firmware_upgrade',
  'Access Point attivo in rete ma disconnesso dal controller UniFi': 'rule_ap_controller_desync',
  'Access Point alimentato (PoE attivo) ma privo di indirizzo IP / irraggiungibile': 'rule_ap_ip_lease_loss',
  'Rete in stato nominale': 'nominal_state',
};

export function resolveRuleId(ruleId?: string | null, rawText?: string | null): string | null {
  if (ruleId && ruleId !== 'custom_rule') return ruleId;
  if (!rawText) return null;

  const trimmed = rawText.trim();
  if (TITLE_TO_RULE_ID[trimmed]) return TITLE_TO_RULE_ID[trimmed];

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('guasto apparato:')) {
    return 'rule_generic_failure';
  }

  // Exact match case-insensitive
  for (const [itTitle, id] of Object.entries(TITLE_TO_RULE_ID)) {
    if (lower === itTitle.toLowerCase()) {
      return id;
    }
  }

  // Substring match
  for (const [itTitle, id] of Object.entries(TITLE_TO_RULE_ID)) {
    const itLower = itTitle.toLowerCase();
    if (lower.includes(itLower) || itLower.includes(lower)) {
      return id;
    }
  }

  return null;
}

export function translateDiagnosisTitle(
  t: (key: string, options?: any) => string,
  ruleId?: string | null,
  rawTitle?: string | null
): string {
  if (!rawTitle && !ruleId) return '';
  const resolved = resolveRuleId(ruleId, rawTitle);

  if (resolved === 'rule_generic_failure') {
    const name = rawTitle ? rawTitle.replace(/^Guasto apparato:\s*/i, '').trim() : 'Apparato';
    const translated = t('rules.rule_generic_failure.title', { name });
    if (translated && !translated.startsWith('rules.')) return translated;
  }

  if (resolved) {
    const key = `rules.${resolved}.title`;
    const translated = t(key);
    if (translated && translated !== key) {
      return translated;
    }
  }

  return rawTitle || '';
}

export function translateDiagnosisSummary(
  t: (key: string, options?: any) => string,
  ruleId?: string | null,
  rawSummary?: string | null,
  rawTitle?: string | null
): string {
  if (!rawSummary && !ruleId) return '';
  const resolved = resolveRuleId(ruleId, rawTitle || rawSummary);

  if (resolved === 'rule_generic_failure') {
    const nameMatch = rawSummary?.match(/L'apparato\s+'([^']+)'/i);
    const name = nameMatch ? nameMatch[1] : (rawTitle ? rawTitle.replace(/^Guasto apparato:\s*/i, '').trim() : 'Apparato');
    const translated = t('rules.rule_generic_failure.summary', { name });
    if (translated && !translated.startsWith('rules.')) return translated;
  }

  if (resolved) {
    const key = `rules.${resolved}.summary`;
    const translated = t(key);
    if (translated && translated !== key) {
      return translated;
    }
  }

  return rawSummary || '';
}

export function translateIncidentSummary(
  t: (key: string, options?: any) => string,
  rawSummary?: string | null,
  ruleId?: string | null
): string {
  if (!rawSummary) return '';

  // Check if summary is structured as "Title — Summary"
  if (rawSummary.includes(' — ')) {
    const [rawTitle, ...rest] = rawSummary.split(' — ');
    const restSummary = rest.join(' — ');
    const transTitle = translateDiagnosisTitle(t, ruleId, rawTitle);
    const transSummary = translateDiagnosisSummary(t, ruleId, restSummary, rawTitle);
    if (transTitle && transSummary) {
      return `${transTitle} — ${transSummary}`;
    }
    if (transTitle) return `${transTitle} — ${restSummary}`;
  }

  // Otherwise try translating as title or summary
  const transTitle = translateDiagnosisTitle(t, ruleId, rawSummary);
  if (transTitle && transTitle !== rawSummary) {
    return transTitle;
  }
  const transSummary = translateDiagnosisSummary(t, ruleId, rawSummary);
  if (transSummary && transSummary !== rawSummary) {
    return transSummary;
  }

  return rawSummary;
}

