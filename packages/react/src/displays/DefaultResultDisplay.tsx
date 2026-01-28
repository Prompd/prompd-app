import { useState } from 'react'
import type { Root } from 'react-dom/client'
import type { IPrompdResultDisplay, PrompdExecutionResult } from '../types'
import { PrompdResultModal } from '../components/PrompdResultModal'

/**
 * Default implementation of IPrompdResultDisplay
 * Shows result as a chat message with expandable modal
 */
export class DefaultResultDisplay implements IPrompdResultDisplay {
  private modalContainer: HTMLDivElement | null = null
  private currentResult: PrompdExecutionResult | null = null
  private modalRoot: Root | null = null

  show(result: PrompdExecutionResult): void {
    this.currentResult = result

    // Create modal container if it doesn't exist
    if (!this.modalContainer) {
      this.modalContainer = document.createElement('div')
      this.modalContainer.id = 'prompd-result-modal-root'
      document.body.appendChild(this.modalContainer)
    }

    // Lazy import React DOM to avoid bundling issues
    import('react-dom/client').then(({ createRoot }) => {
      if (!this.modalRoot && this.modalContainer) {
        this.modalRoot = createRoot(this.modalContainer)
      }

      if (this.modalRoot) {
        this.modalRoot.render(
          <ResultModalWrapper
            result={result}
            onClose={() => this.hide()}
          />
        )
      }
    })
  }

  hide(): void {
    if (this.modalRoot) {
      this.modalRoot.unmount()
      this.modalRoot = null
    }

    if (this.modalContainer) {
      document.body.removeChild(this.modalContainer)
      this.modalContainer = null
    }

    this.currentResult = null
  }

  getResult(): PrompdExecutionResult | null {
    return this.currentResult
  }
}

/**
 * Internal wrapper component for the modal
 */
function ResultModalWrapper({
  result,
  onClose
}: {
  result: PrompdExecutionResult
  onClose: () => void
}) {
  const [isOpen, setIsOpen] = useState(true)

  const handleClose = () => {
    setIsOpen(false)
    setTimeout(onClose, 300) // Wait for animation
  }

  return (
    <PrompdResultModal
      result={result}
      isOpen={isOpen}
      onClose={handleClose}
    />
  )
}
