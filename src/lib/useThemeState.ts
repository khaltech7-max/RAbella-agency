import { useEffect, useState } from 'react';

export type AccentThemeKey =
  | 'lime'
  | 'emerald'
  | 'teal'
  | 'amber'
  | 'terracotta'
  | 'sienna'
  | 'navy'
  | 'beige'
  | 'camel'
  | 'olive'
  | 'charcoal'
  | 'brown'
  | 'white';

export interface ThemeChartPalette {
  isDark: boolean;
  accentTheme: AccentThemeKey;
  primary: string;
  secondary: string;
  tertiary: string;
  neutral: string;
  gridStroke: string;
  referenceLine: string;
  axisTick: string;
  emptyRing: string;
  cursorFill: string;
  cardBg: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipMuted: string;
  tooltipAccentBg: string;
  tooltipAccentBorder: string;
  tooltipAccentValue: string;
  calloutBg: string;
  calloutBorder: string;
  calloutLabel: string;
  areaStroke: string;
  areaGrad: string;
  donutPalette: string[];
}

const VALID_ACCENTS = new Set<AccentThemeKey>([
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

function readIsDarkFromDom(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return (
    root.classList.contains('dark') ||
    root.getAttribute('data-resolved-theme') === 'dark'
  );
}

function readAccentFromDom(): AccentThemeKey {
  if (typeof document === 'undefined') return 'lime';
  const raw = (document.documentElement.getAttribute('data-accent-theme') || 'lime') as AccentThemeKey;
  return VALID_ACCENTS.has(raw) ? raw : 'lime';
}

export function getThemeChartPalette(
  accentTheme: AccentThemeKey,
  isDark: boolean
): ThemeChartPalette {
  const baseDark = {
    isDark: true,
    accentTheme,
    neutral: '#313131',
    gridStroke: '#313131',
    referenceLine: '#3A3A3A',
    axisTick: '#9A9F9C',
    emptyRing: '#313131',
    cursorFill: 'rgba(255,255,255,0.04)',
    cardBg: '#212121',
    tooltipBg: '#242424',
    tooltipBorder: '1px solid #353535',
    tooltipText: '#F4F5F4',
    tooltipMuted: '#A6ACA8',
    tooltipAccentBg: '#242424',
    tooltipAccentBorder: '1px solid #383838',
  };

  const baseLight = {
    isDark: false,
    accentTheme,
    neutral: '#E8F1EC',
    gridStroke: '#EEF3F0',
    referenceLine: '#E4ECE8',
    axisTick: '#88948F',
    emptyRing: '#EEF3F0',
    cursorFill: '#F4F8F6',
    cardBg: '#FFFFFF',
    tooltipBg: '#FFFFFF',
    tooltipBorder: '1px solid #E4ECE8',
    tooltipText: '#17231E',
    tooltipMuted: '#5B7268',
  };

  switch (accentTheme) {
    case 'emerald':
      return isDark
        ? {
            ...baseDark,
            primary: '#5BD4A4',
            secondary: '#2D8C66',
            tertiary: '#34D399',
            tooltipAccentBorder: '1px solid #2F5243',
            tooltipAccentValue: '#6EE7B7',
            calloutBg: '#222D28',
            calloutBorder: '#314D40',
            calloutLabel: '#6EE7B7',
            areaStroke: '#5BD4A4',
            areaGrad: '#10B981',
            donutPalette: ['#6EE7B7', '#34D399', '#10B981', '#2E8B67', '#A7F3D0', '#4A7D69'],
          }
        : {
            ...baseLight,
            primary: '#10B981',
            secondary: '#A7F3D0',
            tertiary: '#6EE7B7',
            tooltipAccentBg: '#D1FAE5',
            tooltipAccentBorder: '1px solid #A7F3D0',
            tooltipAccentValue: '#065F46',
            calloutBg: '#D1FAE5',
            calloutBorder: '#A7F3D0',
            calloutLabel: '#065F46',
            areaStroke: '#059669',
            areaGrad: '#A7F3D0',
            donutPalette: ['#059669', '#34D399', '#6EE7B7', '#A7F3D0', '#047857', '#7FC4A8'],
          };

    case 'teal':
      return isDark
        ? {
            ...baseDark,
            primary: '#4CD4C0',
            secondary: '#2A8C82',
            tertiary: '#2DD4BF',
            tooltipAccentBorder: '1px solid #2E4F4B',
            tooltipAccentValue: '#5EEAD4',
            calloutBg: '#212C2B',
            calloutBorder: '#304D4A',
            calloutLabel: '#5EEAD4',
            areaStroke: '#4CD4C0',
            areaGrad: '#14B8A6',
            donutPalette: ['#5EEAD4', '#2DD4BF', '#0D9488', '#25736C', '#99F6E4', '#4A7C77'],
          }
        : {
            ...baseLight,
            primary: '#14B8A6',
            secondary: '#99F6E4',
            tertiary: '#5EEAD4',
            tooltipAccentBg: '#CCFBF1',
            tooltipAccentBorder: '1px solid #99F6E4',
            tooltipAccentValue: '#115E59',
            calloutBg: '#CCFBF1',
            calloutBorder: '#99F6E4',
            calloutLabel: '#115E59',
            areaStroke: '#0D9488',
            areaGrad: '#99F6E4',
            donutPalette: ['#0D9488', '#2DD4BF', '#5EEAD4', '#99F6E4', '#0F766E', '#7ABCB5'],
          };

    case 'amber':
      return isDark
        ? {
            ...baseDark,
            primary: '#EAB848',
            secondary: '#9A742B',
            tertiary: '#F59E0B',
            tooltipAccentBorder: '1px solid #4E4229',
            tooltipAccentValue: '#FCD34D',
            calloutBg: '#2C271E',
            calloutBorder: '#4D412A',
            calloutLabel: '#FCD34D',
            areaStroke: '#EAB848',
            areaGrad: '#D97706',
            donutPalette: ['#FCD34D', '#EAB848', '#D97706', '#8F6824', '#FDE68A', '#A88C54'],
          }
        : {
            ...baseLight,
            primary: '#F59E0B',
            secondary: '#FDE68A',
            tertiary: '#FCD34D',
            neutral: '#F3EFE6',
            tooltipAccentBg: '#FEF3C7',
            tooltipAccentBorder: '1px solid #FDE68A',
            tooltipAccentValue: '#92400E',
            calloutBg: '#FEF3C7',
            calloutBorder: '#FDE68A',
            calloutLabel: '#92400E',
            areaStroke: '#D97706',
            areaGrad: '#FDE68A',
            donutPalette: ['#D97706', '#F59E0B', '#FBBF24', '#FDE68A', '#B45309', '#D6B87C'],
          };

    case 'terracotta':
      return isDark
        ? {
            ...baseDark,
            primary: '#E87A3D',
            secondary: '#9C5532',
            tertiary: '#F0945E',
            tooltipAccentBorder: '1px solid #4E362A',
            tooltipAccentValue: '#F3A272',
            calloutBg: '#2D231E',
            calloutBorder: '#4F372B',
            calloutLabel: '#F3A272',
            areaStroke: '#E87A3D',
            areaGrad: '#E87A3D',
            donutPalette: ['#E87A3D', '#F29D6B', '#C45B26', '#8C4829', '#F8C19F', '#9E715A'],
          }
        : {
            ...baseLight,
            primary: '#E87A3D',
            secondary: '#F7C4A5',
            tertiary: '#F29D6B',
            neutral: '#F2EAE5',
            tooltipAccentBg: '#FDE8DC',
            tooltipAccentBorder: '1px solid #F7C4A5',
            tooltipAccentValue: '#9A3412',
            calloutBg: '#FDE8DC',
            calloutBorder: '#F7C4A5',
            calloutLabel: '#9A3412',
            areaStroke: '#D9682B',
            areaGrad: '#F7C4A5',
            donutPalette: ['#E87A3D', '#F29D6B', '#F7C4A5', '#C85D26', '#FADACA', '#B57B5C'],
          };

    case 'sienna':
      return isDark
        ? {
            ...baseDark,
            primary: '#DC6D34',
            secondary: '#8C4726',
            tertiary: '#E88754',
            tooltipAccentBorder: '1px solid #4B3226',
            tooltipAccentValue: '#EC9365',
            calloutBg: '#2B211C',
            calloutBorder: '#4C3226',
            calloutLabel: '#EC9365',
            areaStroke: '#DC6D34',
            areaGrad: '#CC5D24',
            donutPalette: ['#DC6D34', '#E88754', '#A84A1B', '#7A3D21', '#F2B391', '#94624B'],
          }
        : {
            ...baseLight,
            primary: '#CC5D24',
            secondary: '#F2B594',
            tertiary: '#E07E4B',
            neutral: '#EFE7E2',
            tooltipAccentBg: '#FADFD2',
            tooltipAccentBorder: '1px solid #F2B594',
            tooltipAccentValue: '#7C2D12',
            calloutBg: '#FADFD2',
            calloutBorder: '#F2B594',
            calloutLabel: '#7C2D12',
            areaStroke: '#B64F1B',
            areaGrad: '#F2B594',
            donutPalette: ['#CC5D24', '#E07E4B', '#F2B594', '#9A3F13', '#F7CEB7', '#A6694A'],
          };

    case 'navy':
      return isDark
        ? {
            ...baseDark,
            primary: '#6E9EF8',
            secondary: '#2E5299',
            tertiary: '#3B82F6',
            tooltipAccentBorder: '1px solid #2D4063',
            tooltipAccentValue: '#93C5FD',
            calloutBg: '#1E2533',
            calloutBorder: '#2F456B',
            calloutLabel: '#93C5FD',
            areaStroke: '#6E9EF8',
            areaGrad: '#3B82F6',
            donutPalette: ['#6E9EF8', '#93C5FD', '#3B82F6', '#2B4C8C', '#BFDBFE', '#6B85B0'],
          }
        : {
            ...baseLight,
            primary: '#1E3A8A',
            secondary: '#93C5FD',
            tertiary: '#3B82F6',
            neutral: '#E8EDF5',
            tooltipAccentBg: '#E0E7FF',
            tooltipAccentBorder: '1px solid #C7D2FE',
            tooltipAccentValue: '#1E3A8A',
            calloutBg: '#E0E7FF',
            calloutBorder: '#C7D2FE',
            calloutLabel: '#1E3A8A',
            areaStroke: '#1E3A8A',
            areaGrad: '#BFDBFE',
            donutPalette: ['#1E3A8A', '#3B82F6', '#60A5FA', '#93C5FD', '#1D4ED8', '#64748B'],
          };

    case 'beige':
      return isDark
        ? {
            ...baseDark,
            primary: '#DECBB2',
            secondary: '#7D6D58',
            tertiary: '#C4AE91',
            tooltipAccentBorder: '1px solid #4A4035',
            tooltipAccentValue: '#EFE4D4',
            calloutBg: '#292520',
            calloutBorder: '#4B4136',
            calloutLabel: '#DECBB2',
            areaStroke: '#DECBB2',
            areaGrad: '#C4AE91',
            donutPalette: ['#DECBB2', '#F0E4D4', '#B8A082', '#7D6D58', '#C9B396', '#9A8B7A'],
          }
        : {
            ...baseLight,
            primary: '#C8B090',
            secondary: '#E6D7C3',
            tertiary: '#D9C4A7',
            neutral: '#F2EDE6',
            tooltipAccentBg: '#F5EFE6',
            tooltipAccentBorder: '1px solid #E5D8C5',
            tooltipAccentValue: '#5C4B37',
            calloutBg: '#F5EFE6',
            calloutBorder: '#E5D8C5',
            calloutLabel: '#5C4B37',
            areaStroke: '#9E8260',
            areaGrad: '#E6D7C3',
            donutPalette: ['#B89B74', '#E6D7C3', '#D4BE9E', '#8C7250', '#EFE6D8', '#A6937C'],
          };

    case 'camel':
      return isDark
        ? {
            ...baseDark,
            primary: '#D6AD7E',
            secondary: '#7E5F3D',
            tertiary: '#B88B5A',
            tooltipAccentBorder: '1px solid #4E3E2C',
            tooltipAccentValue: '#E5C39B',
            calloutBg: '#2A231C',
            calloutBorder: '#4E3D2B',
            calloutLabel: '#E5C39B',
            areaStroke: '#D6AD7E',
            areaGrad: '#C69C6D',
            donutPalette: ['#D6AD7E', '#E8C69E', '#A87C4C', '#785836', '#F2D9BA', '#9C8368'],
          }
        : {
            ...baseLight,
            primary: '#C69C6D',
            secondary: '#EAD5BC',
            tertiary: '#D9B58C',
            neutral: '#F3EDE5',
            tooltipAccentBg: '#F6EBDC',
            tooltipAccentBorder: '1px solid #E8CEAE',
            tooltipAccentValue: '#7A5229',
            calloutBg: '#F6EBDC',
            calloutBorder: '#E8CEAE',
            calloutLabel: '#7A5229',
            areaStroke: '#A3784A',
            areaGrad: '#EAD5BC',
            donutPalette: ['#C69C6D', '#DFBF99', '#9E7446', '#EAD5BC', '#7A5630', '#B89E82'],
          };

    case 'olive':
      return isDark
        ? {
            ...baseDark,
            primary: '#9AB389',
            secondary: '#506344',
            tertiary: '#7C946B',
            tooltipAccentBorder: '1px solid #3D4A35',
            tooltipAccentValue: '#B4CAA5',
            calloutBg: '#242921',
            calloutBorder: '#3F4C37',
            calloutLabel: '#B4CAA5',
            areaStroke: '#9AB389',
            areaGrad: '#809671',
            donutPalette: ['#9AB389', '#B4CAA5', '#6E855F', '#4A5B3E', '#D0E0C5', '#7F8F75'],
          }
        : {
            ...baseLight,
            primary: '#849B74',
            secondary: '#C7D6BC',
            tertiary: '#A3B795',
            neutral: '#EDF1EA',
            tooltipAccentBg: '#E6EDE0',
            tooltipAccentBorder: '1px solid #CBDAC0',
            tooltipAccentValue: '#3B4D2F',
            calloutBg: '#E6EDE0',
            calloutBorder: '#CBDAC0',
            calloutLabel: '#3B4D2F',
            areaStroke: '#5E744F',
            areaGrad: '#C7D6BC',
            donutPalette: ['#6F855F', '#849B74', '#A8BC99', '#C7D6BC', '#4E6141', '#95A58B'],
          };

    case 'charcoal':
      return isDark
        ? {
            ...baseDark,
            primary: '#A1A8B3',
            secondary: '#525863',
            tertiary: '#78808C',
            tooltipAccentBorder: '1px solid #3E434C',
            tooltipAccentValue: '#CBD5E1',
            calloutBg: '#25272B',
            calloutBorder: '#3E434C',
            calloutLabel: '#CBD5E1',
            areaStroke: '#A1A8B3',
            areaGrad: '#6B7280',
            donutPalette: ['#CBD5E1', '#94A3B8', '#64748B', '#475569', '#E2E8F0', '#7B828D'],
          }
        : {
            ...baseLight,
            primary: '#374151',
            secondary: '#CBD5E1',
            tertiary: '#6B7280',
            neutral: '#EBEEF2',
            tooltipAccentBg: '#E5E7EB',
            tooltipAccentBorder: '1px solid #D1D5DB',
            tooltipAccentValue: '#1F2937',
            calloutBg: '#E5E7EB',
            calloutBorder: '#D1D5DB',
            calloutLabel: '#374151',
            areaStroke: '#374151',
            areaGrad: '#D1D5DB',
            donutPalette: ['#374151', '#6B7280', '#9CA3AF', '#D1D5DB', '#1F2937', '#64748B'],
          };

    case 'brown':
      return isDark
        ? {
            ...baseDark,
            primary: '#C48F65',
            secondary: '#6E4A2E',
            tertiary: '#9E6E47',
            tooltipAccentBorder: '1px solid #4A3526',
            tooltipAccentValue: '#DFB28E',
            calloutBg: '#29211B',
            calloutBorder: '#4B3626',
            calloutLabel: '#DFB28E',
            areaStroke: '#C48F65',
            areaGrad: '#9E6E47',
            donutPalette: ['#C48F65', '#DFB28E', '#96633D', '#664328', '#EED0B8', '#8F715B'],
          }
        : {
            ...baseLight,
            primary: '#6B4423',
            secondary: '#D8BFA9',
            tertiary: '#9C6B43',
            neutral: '#F1EAE4',
            tooltipAccentBg: '#EFE3D8',
            tooltipAccentBorder: '1px solid #DCC3AE',
            tooltipAccentValue: '#4E3119',
            calloutBg: '#EFE3D8',
            calloutBorder: '#DCC3AE',
            calloutLabel: '#6B4423',
            areaStroke: '#6B4423',
            areaGrad: '#D8BFA9',
            donutPalette: ['#6B4423', '#9C6B43', '#C49A76', '#D8BFA9', '#4E3119', '#8A6F5A'],
          };

    case 'white':
      return isDark
        ? {
            ...baseDark,
            primary: '#F4F5F4',
            secondary: '#6B7280',
            tertiary: '#D1D5DB',
            tooltipAccentBorder: '1px solid #4B5563',
            tooltipAccentValue: '#FFFFFF',
            calloutBg: '#262626',
            calloutBorder: '#3F3F46',
            calloutLabel: '#FFFFFF',
            areaStroke: '#FFFFFF',
            areaGrad: '#9CA3AF',
            donutPalette: ['#FFFFFF', '#D1D5DB', '#9CA3AF', '#6B7280', '#E5E7EB', '#4B5563'],
          }
        : {
            ...baseLight,
            primary: '#6B7280',
            secondary: '#E5E7EB',
            tertiary: '#D1D5DB',
            neutral: '#F3F4F6',
            tooltipAccentBg: '#F9FAFB',
            tooltipAccentBorder: '1px solid #D1D5DB',
            tooltipAccentValue: '#17231E',
            calloutBg: '#F9FAFB',
            calloutBorder: '#D1D5DB',
            calloutLabel: '#374151',
            areaStroke: '#4B5563',
            areaGrad: '#E5E7EB',
            donutPalette: ['#4B5563', '#9CA3AF', '#D1D5DB', '#6B7280', '#E5E7EB', '#374151'],
          };

    case 'lime':
    default:
      return isDark
        ? {
            ...baseDark,
            primary: '#AED654',
            secondary: '#34D399',
            tertiary: '#84B33D',
            tooltipAccentBorder: '1px solid #3B4A31',
            tooltipAccentValue: '#CBEB7E',
            calloutBg: '#252C22',
            calloutBorder: '#3B4A31',
            calloutLabel: '#AED654',
            areaStroke: '#AED654',
            areaGrad: '#34D399',
            donutPalette: ['#34D399', '#AED654', '#6EE7B7', '#84B33D', '#2D9E74', '#749C84'],
          }
        : {
            ...baseLight,
            primary: '#D5F267',
            secondary: '#BCEAD2',
            tertiary: '#E5F7A3',
            tooltipAccentBg: '#E4F69B',
            tooltipAccentBorder: '1px solid #CEE876',
            tooltipAccentValue: '#17231E',
            calloutBg: '#E4F69B',
            calloutBorder: '#CEE876',
            calloutLabel: '#4F613F',
            areaStroke: '#B5DA46',
            areaGrad: '#CBEAD8',
            donutPalette: ['#BCEAD2', '#D5F267', '#DFF5B0', '#88D4AE', '#C4E758', '#A5C9B6'],
          };
  }
}

/**
 * Reactively tracks whether the document is currently in dark mode.
 * Used by Recharts SVGs and custom chart tooltips that take color props instead of CSS classes.
 */
export function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => readIsDarkFromDom());

  useEffect(() => {
    setIsDark(readIsDarkFromDom());
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
      return;
    }
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(readIsDarkFromDom());
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-resolved-theme', 'data-theme-mode'],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

/**
 * Reactively tracks both Light/Dark mode and Brand Accent Theme for charts,
 * legends, progress bars, and dynamic SVG fills.
 */
export function useThemePalette(): ThemeChartPalette {
  const [state, setState] = useState<{ isDark: boolean; accent: AccentThemeKey }>(() => ({
    isDark: readIsDarkFromDom(),
    accent: readAccentFromDom(),
  }));

  useEffect(() => {
    const sync = () => {
      const nextDark = readIsDarkFromDom();
      const nextAccent = readAccentFromDom();
      setState((prev) =>
        prev.isDark === nextDark && prev.accent === nextAccent
          ? prev
          : { isDark: nextDark, accent: nextAccent }
      );
    };
    sync();
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
      return;
    }
    const root = document.documentElement;
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-resolved-theme', 'data-theme-mode', 'data-accent-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return getThemeChartPalette(state.accent, state.isDark);
}
