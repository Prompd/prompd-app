/**
 * ErrorHandlerPreviewIcon - A more descriptive icon for the docked error handler.
 *
 * It shows the base alert triangle, but also includes a smaller icon
 * representing the configured error handling strategy (e.g., retry, fallback).
 */
import React from 'react';
import {
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Bell,
  XCircle,
  RotateCcw,
  Icon as LucideIcon,
} from 'lucide-react';
import { useWorkflowStore } from '../../../../stores/workflowStore';
import type { ErrorHandlerNodeData } from '../../../services/workflowTypes';
import { getNodeColor } from '../nodeColors';

const strategyIcons: Record<string, typeof LucideIcon> = {
  retry: RefreshCw,
  fallback: ArrowRight,
  notify: Bell,
  ignore: XCircle,
  rethrow: RotateCcw,
};

interface ErrorHandlerPreviewIconProps {
  nodeId: string;
  baseIconStyle: React.CSSProperties;
}

export const ErrorHandlerPreviewIcon = ({ nodeId, baseIconStyle }: ErrorHandlerPreviewIconProps) => {
  const node = useWorkflowStore(state => state.nodes.find(n => n.id === nodeId));
  const nodeData = node?.data as ErrorHandlerNodeData | undefined;
  const strategy = nodeData?.strategy || 'retry';
  const StrategyIcon = strategyIcons[strategy] || RefreshCw;
  const nodeColor = getNodeColor('error-handler');

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
      {/* Base Alert Triangle */}
      <AlertTriangle style={baseIconStyle} />

      {/* Strategy Icon Overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: -2,
          right: -2,
          width: 12,
          height: 12,
          background: 'var(--panel-2)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border)',
        }}
      >
        <StrategyIcon
          style={{
            width: 8,
            height: 8,
            color: nodeColor,
          }} iconNode={[]}
        />
      </div>
    </div>
  );
};
