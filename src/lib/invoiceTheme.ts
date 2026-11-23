import type { AccentThemeKey } from './useThemeState';

export interface InvoiceThemePalette {
  accentTheme: AccentThemeKey;
  titleColor: string;
  barBg: string;
  barText: string;
  barMutedText: string;
  barBorder: string;
  sectionLabelColor: string;
  primaryText: string;
  mutedText: string;
  ruleLineColor: string;
  softBg: string;
  softBorder: string;
  badgeBg: string;
  badgeText: string;
  emblemBars: [string, string, string];
}

const VALID_INVOICE_THEMES = new Set<AccentThemeKey>([
  'lime',
  'emerald',
  'teal',
  'amber',
  'terracotta',
  'sienna',
  'navy',
  'beige',
  'camel',
  'olive',
  'charcoal',
  'brown',
  'white',
]);

export function normalizeInvoiceAccentTheme(raw?: string | null): AccentThemeKey {
  const candidate = String(raw || 'lime').trim().toLowerCase() as AccentThemeKey;
  return VALID_INVOICE_THEMES.has(candidate) ? candidate : 'lime';
}

export function resolveInvoiceThemePalette(rawAccentTheme?: string | null): InvoiceThemePalette {
  const accentTheme = normalizeInvoiceAccentTheme(rawAccentTheme);

  switch (accentTheme) {
    case 'emerald':
      return {
        accentTheme,
        titleColor: '#065F46',
        barBg: '#059669',
        barText: '#FFFFFF',
        barMutedText: '#D1FAE5',
        barBorder: '#059669',
        sectionLabelColor: '#064E3B',
        primaryText: '#17231E',
        mutedText: '#4B5E55',
        ruleLineColor: '#E4EDE8',
        softBg: '#ECFDF5',
        softBorder: '#A7F3D0',
        badgeBg: '#D1FAE5',
        badgeText: '#065F46',
        emblemBars: ['#6EE7B7', '#10B981', '#065F46'],
      };

    case 'teal':
      return {
        accentTheme,
        titleColor: '#0F766E',
        barBg: '#0F766E',
        barText: '#FFFFFF',
        barMutedText: '#CCFBF1',
        barBorder: '#0F766E',
        sectionLabelColor: '#134E4A',
        primaryText: '#17231E',
        mutedText: '#4B5E5B',
        ruleLineColor: '#E3ECEA',
        softBg: '#F0FDFA',
        softBorder: '#99F6E4',
        badgeBg: '#CCFBF1',
        badgeText: '#115E59',
        emblemBars: ['#5EEAD4', '#14B8A6', '#0F766E'],
      };

    case 'amber':
      return {
        accentTheme,
        titleColor: '#B45309',
        barBg: '#B45309',
        barText: '#FFFFFF',
        barMutedText: '#FEF3C7',
        barBorder: '#B45309',
        sectionLabelColor: '#78350F',
        primaryText: '#1F1B16',
        mutedText: '#5C5449',
        ruleLineColor: '#EDE8DF',
        softBg: '#FFFBEB',
        softBorder: '#FDE68A',
        badgeBg: '#FEF3C7',
        badgeText: '#92400E',
        emblemBars: ['#FCD34D', '#F59E0B', '#B45309'],
      };

    case 'terracotta':
      return {
        accentTheme,
        titleColor: '#C85A1F',
        barBg: '#D9682B',
        barText: '#FFFFFF',
        barMutedText: '#FDE8DC',
        barBorder: '#D9682B',
        sectionLabelColor: '#7C2D12',
        primaryText: '#231A16',
        mutedText: '#5E5049',
        ruleLineColor: '#EFE6E1',
        softBg: '#FFF5EF',
        softBorder: '#F7C4A5',
        badgeBg: '#FDE8DC',
        badgeText: '#9A3412',
        emblemBars: ['#F7C4A5', '#E87A3D', '#9A3412'],
      };

    case 'sienna':
      return {
        accentTheme,
        titleColor: '#B54E1B',
        barBg: '#CC5D24',
        barText: '#FFFFFF',
        barMutedText: '#FADFD2',
        barBorder: '#CC5D24',
        sectionLabelColor: '#7C2D12',
        primaryText: '#221914',
        mutedText: '#5E4E46',
        ruleLineColor: '#EFE5DF',
        softBg: '#FDF4EF',
        softBorder: '#F2B594',
        badgeBg: '#FADFD2',
        badgeText: '#7C2D12',
        emblemBars: ['#E88754', '#CC5D24', '#7C2D12'],
      };

    case 'navy':
      return {
        accentTheme,
        titleColor: '#1E3A8A',
        barBg: '#1E3A8A',
        barText: '#FFFFFF',
        barMutedText: '#DBEAFE',
        barBorder: '#1E3A8A',
        sectionLabelColor: '#172554',
        primaryText: '#172033',
        mutedText: '#4B5565',
        ruleLineColor: '#E5E9F0',
        softBg: '#EFF6FF',
        softBorder: '#BFDBFE',
        badgeBg: '#DBEAFE',
        badgeText: '#1E3A8A',
        emblemBars: ['#93C5FD', '#3B82F6', '#1E3A8A'],
      };

    case 'beige':
      return {
        accentTheme,
        titleColor: '#7A6348',
        barBg: '#E6D7C3',
        barText: '#3B2F22',
        barMutedText: '#5C4934',
        barBorder: '#D4BE9E',
        sectionLabelColor: '#3B2F22',
        primaryText: '#2A2219',
        mutedText: '#665A4D',
        ruleLineColor: '#EDE6DC',
        softBg: '#FAF6F0',
        softBorder: '#E5D8C5',
        badgeBg: '#F2E9DC',
        badgeText: '#4E3E2B',
        emblemBars: ['#E6D7C3', '#C8B090', '#7A6348'],
      };

    case 'camel':
      return {
        accentTheme,
        titleColor: '#8F6438',
        barBg: '#A87C4C',
        barText: '#FFFFFF',
        barMutedText: '#F5E8D8',
        barBorder: '#9B7042',
        sectionLabelColor: '#4A3118',
        primaryText: '#261D14',
        mutedText: '#615346',
        ruleLineColor: '#EDE6DD',
        softBg: '#FBF7F2',
        softBorder: '#E8CEAE',
        badgeBg: '#F3E4D1',
        badgeText: '#6E4923',
        emblemBars: ['#EAD5BC', '#C69C6D', '#8F6438'],
      };

    case 'olive':
      return {
        accentTheme,
        titleColor: '#4E6141',
        barBg: '#5F7450',
        barText: '#FFFFFF',
        barMutedText: '#E6EDE0',
        barBorder: '#5F7450',
        sectionLabelColor: '#36462B',
        primaryText: '#1D2419',
        mutedText: '#515E4B',
        ruleLineColor: '#E5EBE1',
        softBg: '#F5F8F3',
        softBorder: '#CBDAC0',
        badgeBg: '#E6EDE0',
        badgeText: '#3B4D2F',
        emblemBars: ['#C7D6BC', '#849B74', '#4E6141'],
      };

    case 'charcoal':
      return {
        accentTheme,
        titleColor: '#374151',
        barBg: '#374151',
        barText: '#FFFFFF',
        barMutedText: '#E5E7EB',
        barBorder: '#374151',
        sectionLabelColor: '#1F2937',
        primaryText: '#111827',
        mutedText: '#4B5563',
        ruleLineColor: '#E5E7EB',
        softBg: '#F9FAFB',
        softBorder: '#D1D5DB',
        badgeBg: '#E5E7EB',
        badgeText: '#1F2937',
        emblemBars: ['#9CA3AF', '#6B7280', '#374151'],
      };

    case 'brown':
      return {
        accentTheme,
        titleColor: '#6B4423',
        barBg: '#6B4423',
        barText: '#FFFFFF',
        barMutedText: '#EFE3D8',
        barBorder: '#6B4423',
        sectionLabelColor: '#3E2714',
        primaryText: '#231912',
        mutedText: '#5C4D42',
        ruleLineColor: '#ECE4DD',
        softBg: '#FAF6F3',
        softBorder: '#DCC3AE',
        badgeBg: '#EFE3D8',
        badgeText: '#4E3119',
        emblemBars: ['#C49A76', '#9C6B43', '#6B4423'],
      };

    case 'white':
      return {
        accentTheme,
        titleColor: '#17231E',
        barBg: '#F3F4F6',
        barText: '#111827',
        barMutedText: '#4B5563',
        barBorder: '#D1D5DB',
        sectionLabelColor: '#111827',
        primaryText: '#111827',
        mutedText: '#4B5563',
        ruleLineColor: '#E5E7EB',
        softBg: '#FAFAFA',
        softBorder: '#E5E7EB',
        badgeBg: '#F3F4F6',
        badgeText: '#111827',
        emblemBars: ['#D1D5DB', '#9CA3AF', '#17231E'],
      };

    case 'lime':
    default:
      return {
        accentTheme: 'lime',
        titleColor: '#145338',
        barBg: '#145338',
        barText: '#FFFFFF',
        barMutedText: '#D5F267',
        barBorder: '#145338',
        sectionLabelColor: '#17231E',
        primaryText: '#17231E',
        mutedText: '#46544E',
        ruleLineColor: '#E5ECE8',
        softBg: '#F4F9EC',
        softBorder: '#D4E4BC',
        badgeBg: '#D5F267',
        badgeText: '#17231E',
        emblemBars: ['#9FE249', '#D5F267', '#145338'],
      };
  }
}

export function hexToPdfRgb(hex: string): string {
  const clean = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '0.078 0.325 0.220';
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

export function resolveInvoiceFontStack(fontFamily?: string | null): string {
  const clean = String(fontFamily || '').replace(/['"]/g, '').split(',')[0].trim();
  const allowed = [
    'Plus Jakarta Sans',
    'Inter',
    'Roboto',
    'IBM Plex Sans',
    'DM Sans',
    'Manrope',
    'Outfit',
  ];
  const matched = allowed.find((f) => f.toLowerCase() === clean.toLowerCase()) || 'Plus Jakarta Sans';
  return `'${matched}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
}
