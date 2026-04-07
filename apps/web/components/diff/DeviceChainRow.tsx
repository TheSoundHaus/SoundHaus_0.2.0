"use client";

/**
 * DeviceChainRow — Inline device/effects chain visualization for return & group tracks.
 *
 * Renders a horizontal chain of device name pills (e.g., [Reverb] → [EQ Eight])
 * with color-coding by change type:
 *   - Green pill = added device
 *   - Red pill + strikethrough = removed device
 *   - Blue pill = modified device (shows param changes on expand)
 *   - Zinc pill = unchanged device
 *
 * Also shows track-level parameter changes (volume, pan, sends) and routing info.
 */

import type { TrackDiff, DeviceChange, ParameterChange } from "./types/diff";

// ── Props ──────────────────────────────────────────────────────────────────

interface DeviceChainRowProps {
    /** The track diff data (expected to be return or group type). */
    track: TrackDiff;
    /** Whether this row is in collapsed state. */
    isCollapsed: boolean;
    /** Row height in pixels. */
    height: number;
}

// ── Change type styling ────────────────────────────────────────────────────

const DEVICE_STYLES: Record<string, { bg: string; border: string; text: string; badge?: string }> = {
    added:     { bg: "bg-emerald-900/30", border: "border-emerald-700/50", text: "text-emerald-300", badge: "+" },
    removed:   { bg: "bg-rose-900/30",    border: "border-rose-700/50",    text: "text-rose-300 line-through", badge: "−" },
    modified:  { bg: "bg-blue-900/30",     border: "border-blue-700/50",    text: "text-blue-300", badge: "~" },
    unchanged: { bg: "bg-zinc-800/40",     border: "border-zinc-700/40",    text: "text-zinc-400" },
};

// ── Sub-components ─────────────────────────────────────────────────────────

/** A single device pill in the chain. */
function DevicePill({ device }: { device: DeviceChange | { deviceName: string; changeType: "unchanged"; parameterChanges?: ParameterChange[] } }) {
    const style = DEVICE_STYLES[device.changeType] ?? DEVICE_STYLES.unchanged!;
    const params = device.parameterChanges ?? [];

    return (
        <div className={`inline-flex flex-col rounded-md border ${style!.border} ${style!.bg} px-2.5 py-1.5 min-w-0`}>
            <div className="flex items-center gap-1.5">
                {style!.badge && (
                    <span className={`text-[10px] font-bold ${style!.text.split(" ")[0]}`}>
                        {style!.badge}
                    </span>
                )}
                <span className={`text-xs font-medium ${style!.text} truncate`}>
                    {device.deviceName}
                </span>
            </div>
            {/* Show parameter changes inline when expanded */}
            {params.length > 0 && (
                <div className="mt-1 space-y-0.5">
                    {params.slice(0, 3).map((p, i) => (
                        <div key={i} className="text-[10px] text-zinc-500 truncate leading-tight">
                            {p.description || `${p.name}: ${p.beforeValue ?? "?"} → ${p.afterValue ?? "?"}`}
                        </div>
                    ))}
                    {params.length > 3 && (
                        <div className="text-[10px] text-zinc-600">
                            +{params.length - 3} more
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/** Arrow connector between device pills. */
function ChainArrow() {
    return (
        <span className="text-zinc-600 text-xs shrink-0 px-0.5">→</span>
    );
}

/** Track-level parameter change badge (volume, pan, sends). */
function ParamBadge({ param }: { param: ParameterChange }) {
    return (
        <div className="inline-flex items-center gap-1 rounded bg-amber-900/25 border border-amber-700/40 px-2 py-0.5">
            <span className="text-[10px] text-amber-400 font-medium truncate">
                {param.description || `${param.name}: ${param.beforeValue ?? "?"} → ${param.afterValue ?? "?"}`}
            </span>
        </div>
    );
}

// ── Component ──────────────────────────────────────────────────────────────

export function DeviceChainRow({ track, isCollapsed, height }: DeviceChainRowProps) {
    const devices = track.deviceChanges ?? [];
    const params = track.parameterChanges ?? [];
    const hasRouting = track.routingBefore || track.routingAfter;
    const routingChanged = track.routingBefore && track.routingAfter && track.routingBefore !== track.routingAfter;

    // Collapsed: show a compact single-line summary
    if (isCollapsed) {
        const deviceNames = devices.map(d => d.deviceName).join(" → ");
        const changedCount = devices.length; // all DeviceChange entries represent changes
        const paramCount = params.length;

        return (
            <div
                className="flex items-center gap-3 px-3 text-xs text-zinc-500 select-none overflow-hidden"
                style={{ height }}
            >
                {deviceNames && (
                    <span className="truncate text-zinc-400">
                        {deviceNames}
                    </span>
                )}
                {changedCount > 0 && (
                    <span className="shrink-0 rounded bg-blue-900/30 border border-blue-700/40 px-1.5 py-0.5 text-[10px] text-blue-400">
                        {changedCount} device{changedCount !== 1 ? "s" : ""} changed
                    </span>
                )}
                {paramCount > 0 && (
                    <span className="shrink-0 rounded bg-amber-900/25 border border-amber-700/40 px-1.5 py-0.5 text-[10px] text-amber-400">
                        {paramCount} param{paramCount !== 1 ? "s" : ""}
                    </span>
                )}
            </div>
        );
    }

    // Expanded: show full device chain with parameter details
    return (
        <div
            className="flex flex-col gap-2 px-3 py-2 overflow-y-auto"
            style={{ maxHeight: height }}
        >
            {/* Device chain */}
            {devices.length > 0 && (
                <div className="flex items-start gap-1 flex-wrap">
                    {devices.map((device, i) => (
                        <div key={i} className="flex items-center gap-1">
                            {i > 0 && <ChainArrow />}
                            <DevicePill device={device} />
                        </div>
                    ))}
                </div>
            )}

            {/* Track-level parameter changes (volume, pan, sends) */}
            {params.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {params.map((p, i) => (
                        <ParamBadge key={i} param={p} />
                    ))}
                </div>
            )}

            {/* Routing info */}
            {hasRouting && (
                <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-zinc-600">Routing:</span>
                    {routingChanged ? (
                        <>
                            <span className="text-rose-400/70 line-through">{track.routingBefore}</span>
                            <span className="text-zinc-600">→</span>
                            <span className="text-emerald-400/80">{track.routingAfter}</span>
                        </>
                    ) : (
                        <span className="text-zinc-500">{track.routingAfter ?? track.routingBefore}</span>
                    )}
                </div>
            )}

            {/* If no devices/params at all, show a gentle message */}
            {devices.length === 0 && params.length === 0 && !hasRouting && (
                <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
                    No device or parameter data
                </div>
            )}
        </div>
    );
}
