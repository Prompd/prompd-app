/**
 * PrompdIcon - Inline SVG component for the Prompd "P" logo
 * Uses currentColor so it inherits text color like other Lucide icons
 */
interface PrompdIconProps {
  size?: number
  color?: string
  className?: string
}

export function PrompdIcon({ size = 24, color = 'currentColor', className }: PrompdIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 475 487"
      className={className}
      style={{ display: 'block' }}
    >
      <path fill={color} d="M 271.6313,29.109924 C 456.06055,29.109924 454.60452,304.1 270.40336,304.1 L 228,304 v -47.30173 l 43.85191,0.0317 c 118.41324,0 116.08205,-178.966717 -0.82527,-178.966717 L 132.15087,77.622831 129.6,420.52 c -0.33992,0.0728 -45.968529,35.12868 -45.968529,35.12868 L 83.506489,28.866413 Z" />
      <path fill={color} d="m 156,102 103.33423,0.32678 c 88.07508,0 87.938,129.66692 1.26051,129.66692 l -32.5414,0.0925 -0.0533,-47.08616 32.66331,-0.23913 c 27.90739,0 25.69827,-34.89447 -0.0611,-34.99087 L 204.00004,150 c 0.90517,68.30467 0.52,211.29643 0.52,211.29643 0,0 -48.54879,38.04493 -48.62668,38.05052 z" />
    </svg>
  )
}
