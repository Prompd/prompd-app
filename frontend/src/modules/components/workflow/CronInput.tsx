/**
 * CronInput - Visual cron expression editor
 *
 * Uses react-cron-generator for a crontab.guru-like experience.
 * Styled to match Prompd's dark theme.
 */

import { useCallback } from 'react'
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

export function CronInput({ value, onChange, showMessage = true, error = false }: CronInputProps) {
  const handleChange = useCallback(
    (cronValue: string) => {
      onChange(cronValue)
    },
    [onChange]
  )

  return (
    <div className={`cron-input-wrapper ${error ? 'cron-input-error' : ''}`}>
      <Cron
        onChange={handleChange}
        value={value}
        showResultText={showMessage}
        showResultCron={false}
        isUnix={true}
      />
    </div>
  )
}

export default CronInput
