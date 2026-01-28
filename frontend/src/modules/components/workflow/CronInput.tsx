/**
 * CronInput - Visual cron expression editor
 *
 * Uses react-cron-generator for a crontab.guru-like experience.
 * Styled to match Prompd's dark theme.
 */

import { useState, useCallback } from 'react'
import Cron from 'react-cron-generator'

// Import our theme overrides
import '../../../styles/cron-input-overrides.css'

interface CronInputProps {
  /** Current cron expression value */
  value: string
  /** Callback when value changes */
  onChange: (value: string) => void
  /** Show human-readable description below input */
  showMessage?: boolean
  /** Show error styling */
  error?: boolean
}

/**
 * Convert between Unix (5-field) and Quartz (7-field) cron formats
 * react-cron-generator uses Quartz format by default
 */
function unixToQuartz(unixCron: string): string {
  // Unix: minute hour day month dayOfWeek
  // Quartz: second minute hour day month dayOfWeek year
  const parts = unixCron.trim().split(/\s+/)
  if (parts.length === 5) {
    // Add seconds (0) at start and year (*) at end
    return `0 ${parts.join(' ')} *`
  }
  // Already Quartz format or close to it
  return unixCron
}

function quartzToUnix(quartzCron: string): string {
  // Quartz: second minute hour day month dayOfWeek year
  // Unix: minute hour day month dayOfWeek
  const parts = quartzCron.trim().split(/\s+/)
  if (parts.length >= 6) {
    // Remove seconds (first) and year (last if 7 fields)
    const withoutSeconds = parts.slice(1)
    if (withoutSeconds.length > 5) {
      // Remove year
      return withoutSeconds.slice(0, 5).join(' ')
    }
    return withoutSeconds.join(' ')
  }
  return quartzCron
}

export function CronInput({ value, onChange, showMessage = true, error = false }: CronInputProps) {
  // Convert incoming Unix cron to Quartz for the component
  const [quartzValue, setQuartzValue] = useState(() => unixToQuartz(value))

  const handleChange = useCallback(
    (cronValue: string, humanReadable: string) => {
      setQuartzValue(cronValue)
      // Convert back to Unix format for the parent
      const unixValue = quartzToUnix(cronValue)
      onChange(unixValue)
    },
    [onChange]
  )

  return (
    <div className={`cron-input-wrapper ${error ? 'cron-input-error' : ''}`}>
      <Cron
        onChange={handleChange}
        value={quartzValue}
        showResultText={showMessage}
        showResultCron={false}
        isUnix={false}
      />
    </div>
  )
}

export default CronInput
