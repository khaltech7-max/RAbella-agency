import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, animate, useReducedMotion } from 'motion/react';

export interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  formatLocale?: boolean;
  className?: string;
}

function formatNumberValue(
  num: number,
  decimals: number,
  formatLocale: boolean
): string {
  const safeNum = Number.isFinite(num) ? num : 0;
  const factor = Math.pow(10, decimals);
  const rounded =
    decimals > 0 ? Math.round(safeNum * factor) / factor : Math.round(safeNum);

  if (!formatLocale) {
    return decimals > 0 ? rounded.toFixed(decimals) : String(rounded);
  }

  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Smoothly counts from 0 to `value` on mount (page navigation) and animates
 * to any updated database value without re-triggering on unrelated React re-renders.
 */
export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  duration = 0.85,
  formatLocale = true,
  className,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const safeTarget = Number.isFinite(Number(value)) ? Number(value) : 0;

  const motionVal = useMotionValue(0);
  const hasAnimatedMountRef = useRef(false);
  const lastTargetRef = useRef<number>(safeTarget);

  const [displayText, setDisplayText] = useState<string>(() => {
    const startVal = prefersReducedMotion ? safeTarget : 0;
    return `${prefix}${formatNumberValue(startVal, decimals, formatLocale)}${suffix}`;
  });

  useEffect(() => {
    if (prefersReducedMotion) {
      motionVal.set(safeTarget);
      setDisplayText(
        `${prefix}${formatNumberValue(safeTarget, decimals, formatLocale)}${suffix}`
      );
      lastTargetRef.current = safeTarget;
      hasAnimatedMountRef.current = true;
      return;
    }

    // Prevent duplicate animation triggers on unrelated React re-renders
    if (hasAnimatedMountRef.current && lastTargetRef.current === safeTarget) {
      return;
    }

    const fromValue = hasAnimatedMountRef.current ? lastTargetRef.current : 0;
    hasAnimatedMountRef.current = true;
    lastTargetRef.current = safeTarget;

    motionVal.set(fromValue);

    if (fromValue === safeTarget) {
      setDisplayText(
        `${prefix}${formatNumberValue(safeTarget, decimals, formatLocale)}${suffix}`
      );
      return;
    }

    const controls = animate(motionVal, safeTarget, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        setDisplayText(
          `${prefix}${formatNumberValue(latest, decimals, formatLocale)}${suffix}`
        );
      },
      onComplete: () => {
        setDisplayText(
          `${prefix}${formatNumberValue(safeTarget, decimals, formatLocale)}${suffix}`
        );
      },
    });

    return () => {
      controls.stop();
    };
  }, [safeTarget, prefix, suffix, decimals, duration, formatLocale, prefersReducedMotion, motionVal]);

  return <span className={className}>{displayText}</span>;
};

export interface AnimatedProgressBarProps {
  percent: number;
  className?: string;
  delay?: number;
  duration?: number;
  title?: string;
}

/**
 * Smoothly animates a horizontal progress bar or availability segment from 0% to `percent`%
 * when the page mounts or when database values update.
 */
export const AnimatedProgressBar: React.FC<AnimatedProgressBarProps> = ({
  percent,
  className = '',
  delay = 0,
  duration = 0.85,
  title,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const clamped = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));

  return (
    <motion.div
      initial={{ width: prefersReducedMotion ? `${clamped}%` : '0%' }}
      animate={{ width: `${clamped}%` }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : {
              duration,
              delay,
              ease: [0.16, 1, 0.3, 1],
            }
      }
      className={className}
      title={title}
    />
  );
};

export interface AnimatedChartRevealProps {
  children: React.ReactNode;
  className?: string;
  direction?: 'left-to-right' | 'fade-up';
  duration?: number;
}

/**
 * Progressively reveals a chart container (e.g. left-to-right clip reveal for Revenue line/area charts)
 * when navigating to a page, while respecting prefers-reduced-motion.
 */
export const AnimatedChartReveal: React.FC<AnimatedChartRevealProps> = ({
  children,
  className = '',
  direction = 'left-to-right',
  duration = 0.85,
}) => {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  if (direction === 'left-to-right') {
    return (
      <motion.div
        initial={{ clipPath: 'inset(0 100% 0 0)', opacity: 0.4 }}
        animate={{ clipPath: 'inset(0 0% 0 0)', opacity: 1 }}
        transition={{
          duration,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.65,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
