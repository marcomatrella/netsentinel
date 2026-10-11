export interface ColorOption {
  id: string;
  name: string;
  dotClass: string;
  bgClass: string;
  borderClass: string;
  badgeClass: string;
  textClass: string;
  ringClass: string;
}

export const PRESET_COLORS: ColorOption[] = [
  { id: 'slate', name: 'Neutro (Grigio)', dotClass: 'bg-slate-500', bgClass: 'bg-slate-500', borderClass: 'border-slate-500', badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300', textClass: 'text-slate-500', ringClass: 'ring-slate-500' },
  { id: 'sky', name: 'Azzurro (Rete)', dotClass: 'bg-sky-500', bgClass: 'bg-sky-500', borderClass: 'border-sky-500', badgeClass: 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300', textClass: 'text-sky-500', ringClass: 'ring-sky-500' },
  { id: 'blue', name: 'Blu (WAN / Gateway)', dotClass: 'bg-blue-600', bgClass: 'bg-blue-600', borderClass: 'border-blue-600', badgeClass: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300', textClass: 'text-blue-600', ringClass: 'ring-blue-600' },
  { id: 'indigo', name: 'Indaco (Switch)', dotClass: 'bg-indigo-500', bgClass: 'bg-indigo-500', borderClass: 'border-indigo-500', badgeClass: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300', textClass: 'text-indigo-500', ringClass: 'ring-indigo-500' },
  { id: 'violet', name: 'Viola (Server & VM)', dotClass: 'bg-violet-500', bgClass: 'bg-violet-500', borderClass: 'border-violet-500', badgeClass: 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300', textClass: 'text-violet-500', ringClass: 'ring-violet-500' },
  { id: 'purple', name: 'Porpora (Servizi)', dotClass: 'bg-purple-500', bgClass: 'bg-purple-500', borderClass: 'border-purple-500', badgeClass: 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300', textClass: 'text-purple-500', ringClass: 'ring-purple-500' },
  { id: 'emerald', name: 'Smeraldo (IoT / Domotica)', dotClass: 'bg-emerald-500', bgClass: 'bg-emerald-500', borderClass: 'border-emerald-500', badgeClass: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300', textClass: 'text-emerald-500', ringClass: 'ring-emerald-500' },
  { id: 'teal', name: 'Verde Acqua (Access Point)', dotClass: 'bg-teal-500', bgClass: 'bg-teal-500', borderClass: 'border-teal-500', badgeClass: 'bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300', textClass: 'text-teal-500', ringClass: 'ring-teal-500' },
  { id: 'amber', name: 'Ambra (NAS / Storage)', dotClass: 'bg-amber-500', bgClass: 'bg-amber-500', borderClass: 'border-amber-500', badgeClass: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300', textClass: 'text-amber-500', ringClass: 'ring-amber-500' },
  { id: 'orange', name: 'Arancione (UPS / Energia)', dotClass: 'bg-orange-500', bgClass: 'bg-orange-500', borderClass: 'border-orange-500', badgeClass: 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300', textClass: 'text-orange-500', ringClass: 'ring-orange-500' },
  { id: 'rose', name: 'Rosa (Sicurezza / Firewall)', dotClass: 'bg-rose-500', bgClass: 'bg-rose-500', borderClass: 'border-rose-500', badgeClass: 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300', textClass: 'text-rose-500', ringClass: 'ring-rose-500' },
  { id: 'cyan', name: 'Ciano (DNS & Web)', dotClass: 'bg-cyan-500', bgClass: 'bg-cyan-500', borderClass: 'border-cyan-500', badgeClass: 'bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300', textClass: 'text-cyan-500', ringClass: 'ring-cyan-500' },
];

export const getDeviceColorId = (tags: string[] = []): string => {
  const tag = tags.find((t) => t.startsWith('color:'));
  return tag ? tag.replace('color:', '') : 'slate';
};

export const setDeviceColorTag = (tags: string[] = [], colorId: string): string[] => {
  const withoutColor = tags.filter((t) => !t.startsWith('color:'));
  if (!colorId || colorId === 'slate') return withoutColor;
  return [...withoutColor, `color:${colorId}`];
};

export const getColorConfig = (colorId: string): ColorOption => {
  return PRESET_COLORS.find((c) => c.id === colorId) || PRESET_COLORS[0];
};

export const getDefaultColorForKind = (kind: string): string => {
  switch (kind) {
    case 'firewall':
      return 'rose';
    case 'router':
    case 'wan_gateway':
    case 'modem':
      return 'blue';
    case 'switch':
      return 'sky';
    case 'access_point':
      return 'teal';
    case 'nas':
      return 'amber';
    case 'server':
      return 'violet';
    case 'smart_hub':
      return 'emerald';
    case 'ups':
      return 'orange';
    case 'camera':
    case 'nvr':
      return 'indigo';
    case 'printer':
      return 'cyan';
    case 'smart_plug':
      return 'emerald';
    case 'sensor':
      return 'teal';
    case 'service':
      return 'purple';
    default:
      return 'slate';
  }
};

