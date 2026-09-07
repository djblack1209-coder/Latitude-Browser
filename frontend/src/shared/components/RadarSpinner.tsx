/**
 * Adapted from wayjam/komari-theme-commander's HudSpinner.tsx.
 * Source commit: e7191c1a775027f74c2fcff96bc9d71ff4ac7ac2.
 * MIT, Copyright (c) 2026 WayJam So.
 * Full notice: third_party/licenses/komari-theme-commander-MIT.txt.
 */
import clsx from 'clsx'
import './radar-spinner.css'

export interface RadarSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}

export function RadarSpinner({ size = 'md', label = '加载中', className }: RadarSpinnerProps) {
  return (
    <span
      className={clsx('radar-spinner', className)}
      data-size={size}
      role="status"
      aria-label={label}
    >
      <span className="radar-spinner__label">{label}</span>
      {size === 'lg' ? <RadarSweep /> : <DiamondRotor />}
    </span>
  )
}

function DiamondRotor() {
  return (
    <svg className="radar-spinner__graphic" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <g className="radar-spinner__rotor">
        <rect className="radar-spinner__diamond" x="5.5" y="5.5" width="13" height="13" rx="1" />
      </g>
      <circle className="radar-spinner__core" cx="12" cy="12" r="1.75" />
    </svg>
  )
}

function RadarSweep() {
  return (
    <svg className="radar-spinner__graphic" viewBox="0 0 48 48" focusable="false" aria-hidden="true">
      <circle className="radar-spinner__ring radar-spinner__ring--outer" cx="24" cy="24" r="21.5" />
      <circle className="radar-spinner__ring radar-spinner__ring--inner" cx="24" cy="24" r="12.5" />
      <path className="radar-spinner__crosshair" d="M3 24h42M24 3v42" />
      <g className="radar-spinner__rotor radar-spinner__sweep">
        <path className="radar-spinner__sweep-field" d="M24 24V2.5A21.5 21.5 0 0 1 42.6 13.25Z" />
        <path className="radar-spinner__sweep-line" d="M24 24V2.5" />
      </g>
      <circle className="radar-spinner__core" cx="24" cy="24" r="2" />
    </svg>
  )
}
