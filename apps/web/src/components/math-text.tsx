import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type FractionMatch = {
  start: number;
  end: number;
  numerator: string;
  denominator: string;
};

type MathTextProps = {
  text: string;
  fallback?: string;
  className?: string;
};

const PAREN_FRACTION = /\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g;
const SIMPLE_FRACTION =
  /(^|[^A-Za-z0-9_])([A-Za-z0-9.+-]+)\s*\/\s*([A-Za-z0-9.+-]+)(?=$|[^A-Za-z0-9_])/g;

const collectFractions = (text: string): FractionMatch[] => {
  const matches: FractionMatch[] = [];

  for (const match of text.matchAll(PAREN_FRACTION)) {
    const full = match[0];
    const numerator = match[1]?.trim();
    const denominator = match[2]?.trim();
    const start = match.index;
    if (!full || start === undefined || !numerator || !denominator) continue;
    matches.push({ start, end: start + full.length, numerator, denominator });
  }

  for (const match of text.matchAll(SIMPLE_FRACTION)) {
    const full = match[0];
    const leftBoundary = match[1] ?? '';
    const numerator = match[2]?.trim();
    const denominator = match[3]?.trim();
    const start = match.index;
    if (!full || start === undefined || !numerator || !denominator) continue;
    const normalizedStart = start + leftBoundary.length;
    matches.push({
      start: normalizedStart,
      end: normalizedStart + `${numerator}/${denominator}`.length,
      numerator,
      denominator,
    });
  }

  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  const deduped: FractionMatch[] = [];
  let cursor = -1;
  for (const match of matches) {
    if (match.start < cursor) continue;
    deduped.push(match);
    cursor = match.end;
  }
  return deduped;
};

const renderFraction = (numerator: string, denominator: string, key: string) => (
  <span
    key={key}
    className="mx-0.5 inline-flex flex-col items-center align-middle leading-none"
    aria-label={`${numerator} over ${denominator}`}
  >
    <span className="border-b border-current px-1 pb-0.5 text-[0.92em]">{numerator}</span>
    <span className="px-1 pt-0.5 text-[0.92em]">{denominator}</span>
  </span>
);

const tokenizeMathText = (text: string): ReactNode[] => {
  const matches = collectFractions(text);
  if (matches.length === 0) return [text];

  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      nodes.push(text.slice(cursor, match.start));
    }
    nodes.push(
      renderFraction(
        match.numerator,
        match.denominator,
        `${match.start}-${match.end}-${match.numerator}-${match.denominator}`,
      ),
    );
    cursor = match.end;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
};

export const MathText = ({ text, fallback = '—', className }: MathTextProps) => {
  const value = text.trim() ? text : fallback;
  return <span className={cn('whitespace-pre-wrap', className)}>{tokenizeMathText(value)}</span>;
};
