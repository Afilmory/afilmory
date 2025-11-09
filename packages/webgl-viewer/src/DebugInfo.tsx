/**
 * WebGL 图片查看器调试信息组件
 *
 * 该组件用于显示 WebGL 图片查看器的实时调试信息，
 * 包括缩放比例、位置、LOD 级别、性能指标等。
 */

import * as React from 'react'
import { useCallback, useImperativeHandle, useState } from 'react'

import type { DebugInfo } from './interface'

/**
 * 调试信息组件的引用接口
 */
export interface DebugInfoRef {
  /** 更新调试信息的方法 */
  updateDebugInfo: (debugInfo: DebugInfo) => void
}

/**
 * 调试信息组件的属性接口
 */
interface DebugInfoProps {
  /** 组件引用 */
  ref: React.Ref<DebugInfoRef>
  outlineEnabled?: boolean
  onToggleOutline?: (value: boolean) => void
}

/**
 * 可折叠的调试信息分组组件
 */
const CollapsibleSection: React.FC<{
  title: string
  defaultExpanded?: boolean
  children: React.ReactNode
}> = ({ title, defaultExpanded = false, children }) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div style={{ marginBottom: '8px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          padding: '2px 0',
          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
          marginBottom: expanded ? '4px' : '0',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span
          style={{
            marginRight: '6px',
            fontSize: '10px',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        >
          ▶
        </span>
        <span style={{ fontWeight: 'bold', fontSize: '11px' }}>{title}</span>
      </div>
      {expanded && <div style={{ paddingLeft: '16px', fontSize: '11px' }}>{children}</div>}
    </div>
  )
}

/**
 * 状态指示器组件
 */
const StatusIndicator: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
    <span
      style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: color,
        display: 'inline-block',
      }}
    />
    {label}
  </span>
)

/**
 * 调试信息显示组件
 *
 * 在开发模式下显示 WebGL 图片查看器的详细状态信息，
 * 帮助开发者诊断性能问题和调试功能。
 *
 * @param props 组件属性
 * @returns JSX 元素
 */
const DebugInfoComponent = ({ ref, outlineEnabled, onToggleOutline }: DebugInfoProps) => {
  // 调试信息状态，包含所有需要显示的调试数据
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)

  const [collapsed, setCollapsed] = useState(false)

  // 暴露更新调试信息的方法给父组件
  useImperativeHandle(
    ref,
    useCallback(
      () => ({
        updateDebugInfo: (debugInfo: DebugInfo) => {
          setDebugInfo(debugInfo)
        },
      }),
      [],
    ),
  )

  // 获取质量状态颜色
  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'high': {
        return '#4ade80'
      }
      case 'medium': {
        return '#fbbf24'
      }
      case 'low': {
        return '#f87171'
      }
      default: {
        return '#94a3b8'
      }
    }
  }

  // 获取内存压力颜色
  const getMemoryPressureColor = (pressure: number) => {
    if (pressure < 50) return '#4ade80'
    if (pressure < 80) return '#fbbf24'
    return '#f87171'
  }

  // 新增：瓦片系统调试信息类型辅助
  function renderTileSystem(tileSystem?: any) {
    if (!tileSystem) return null
    return (
      <CollapsibleSection title="Tile System" defaultExpanded={false}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Cache Size:</span>
          <span>
            {tileSystem.cacheSize} / {tileSystem.cacheLimit}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Visible Tiles:</span>
          <span>{tileSystem.visibleTiles}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Loading Tiles:</span>
          <span>{tileSystem.loadingTiles}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Pending Requests:</span>
          <span>{tileSystem.pendingRequests}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Tile Size:</span>
          <span>{tileSystem.tileSize}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Max Tiles/Frame:</span>
          <span>{tileSystem.maxTilesPerFrame}</span>
        </div>
        {/* 可选：显示部分 key 信息，避免过长 */}
        <div style={{ fontSize: '10px', marginTop: 4, opacity: 0.7 }}>
          <div>
            Cache Keys: {tileSystem.cacheKeys?.slice(0, 3).join(', ')}
            {tileSystem.cacheKeys?.length > 3 ? ' ...' : ''}
          </div>
          <div>
            Visible Keys: {tileSystem.visibleKeys?.slice(0, 3).join(', ')}
            {tileSystem.visibleKeys?.length > 3 ? ' ...' : ''}
          </div>
          <div>
            Loading Keys: {tileSystem.loadingKeys?.slice(0, 3).join(', ')}
            {tileSystem.loadingKeys?.length > 3 ? ' ...' : ''}
          </div>
          <div>
            Pending Keys: {tileSystem.pendingKeys?.slice(0, 3).join(', ')}
            {tileSystem.pendingKeys?.length > 3 ? ' ...' : ''}
          </div>
        </div>
      </CollapsibleSection>
    )
  }

  if (!debugInfo) return null

  const currentOutlineEnabled = outlineEnabled !== undefined ? outlineEnabled : (debugInfo.tileOutlinesEnabled ?? false)

  return (
    <div
      style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        padding: '8px',
        borderRadius: '6px',
        fontSize: '11px',
        fontFamily: 'monospace',
        lineHeight: '1.3',
        pointerEvents: 'auto',
        zIndex: 1000,
        minWidth: '240px',
        maxWidth: '300px',
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      {/* 调试面板标题和折叠按钮 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
          paddingBottom: '4px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <span style={{ fontWeight: 'bold', fontSize: '12px' }}>WebGL Debug</span>
        <button
          type="button"
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: '10px',
            padding: '2px 4px',
            borderRadius: '2px',
            opacity: 0.7,
          }}
          onClick={() => setCollapsed(!collapsed)}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
        >
          {collapsed ? '📈' : '📉'}
        </button>
      </div>

      {!collapsed && (
        <>
          {onToggleOutline && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Tile Outline:</span>
                <button
                  type="button"
                  style={{
                    background: currentOutlineEnabled ? 'rgba(34, 197, 94, 0.25)' : 'rgba(148, 163, 184, 0.25)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '3px',
                  }}
                  onClick={() => onToggleOutline(!currentOutlineEnabled)}
                >
                  {currentOutlineEnabled ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          )}
          {/* 核心状态信息 - 始终显示 */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Scale:</span>
              <span>{debugInfo.scale.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>LOD:</span>
              <span>
                {debugInfo.currentLOD} / {debugInfo.lodLevels - 1}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Quality:</span>
              <StatusIndicator color={getQualityColor(debugInfo.quality)} label={debugInfo.quality} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Status:</span>
              <StatusIndicator
                color={debugInfo.isLoading ? '#fbbf24' : '#4ade80'}
                label={debugInfo.isLoading ? 'Loading' : 'Ready'}
              />
            </div>
          </div>

          {/* 位置和变换信息 */}
          <CollapsibleSection title="Transform">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Relative Scale:</span>
              <span>{debugInfo.relativeScale.toFixed(3)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Position:</span>
              <span>
                ({debugInfo.translateX.toFixed(0)}, {debugInfo.translateY.toFixed(0)})
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Fit Scale:</span>
              <span>{debugInfo.fitToScreenScale.toFixed(3)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Max Scale:</span>
              <span>{debugInfo.effectiveMaxScale.toFixed(3)}</span>
            </div>
          </CollapsibleSection>

          {/* 画布和图像信息 */}
          <CollapsibleSection title="Image Info">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Canvas:</span>
              <span>
                {debugInfo.canvasSize.width}×{debugInfo.canvasSize.height}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Image:</span>
              <span>
                {debugInfo.imageSize.width}×{debugInfo.imageSize.height}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>DPR:</span>
              <span>{window.devicePixelRatio || 1}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Max Texture:</span>
              <span>{debugInfo.maxTextureSize}</span>
            </div>
          </CollapsibleSection>

          {/* 内存信息 */}
          <CollapsibleSection title="Memory">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Textures:</span>
              <span>{debugInfo.memory.textures.toFixed(1)} MB</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Estimated:</span>
              <span>{debugInfo.memory.estimated.toFixed(1)} MB</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Budget:</span>
              <span>{debugInfo.memory.budget.toFixed(1)} MB</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Pressure:</span>
              <StatusIndicator
                color={getMemoryPressureColor(debugInfo.memory.pressure)}
                label={`${debugInfo.memory.pressure.toFixed(1)}%`}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Active LODs:</span>
              <span>
                {debugInfo.memory.activeLODs} / {debugInfo.memory.maxConcurrentLODs}
              </span>
            </div>
          </CollapsibleSection>
          {/* 新增：瓦片系统调试信息展示 */}
          {renderTileSystem((debugInfo as any).tileSystem)}
        </>
      )}

      {/* 折叠状态下的简化显示 */}
      {collapsed && (
        <div style={{ fontSize: '10px', opacity: 0.8 }}>
          <div>
            Scale: {debugInfo.scale.toFixed(2)} | LOD: {debugInfo.currentLOD} |{' '}
            <StatusIndicator color={getQualityColor(debugInfo.quality)} label={debugInfo.quality} />
          </div>
        </div>
      )}
    </div>
  )
}

// 设置显示名称用于 React DevTools
DebugInfoComponent.displayName = 'DebugInfo'

// 导出为默认和命名导出
export default DebugInfoComponent
export { DebugInfoComponent as DebugInfo }
