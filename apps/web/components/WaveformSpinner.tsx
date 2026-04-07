"use client";

interface WaveformSpinnerProps {
    /** Number of bars */
    bars?: number;
    /** Size class: "sm" | "md" | "lg" */
    size?: "sm" | "md" | "lg";
    /** Optional label below the spinner */
    label?: string;
}

const sizeConfig = {
    sm: { height: 16, barWidth: 2, gap: 1 },
    md: { height: 28, barWidth: 3, gap: 2 },
    lg: { height: 40, barWidth: 4, gap: 3 },
};

export default function WaveformSpinner({
    bars = 5,
    size = "md",
    label,
}: WaveformSpinnerProps) {
    const { height, barWidth, gap } = sizeConfig[size];
    const totalWidth = bars * barWidth + (bars - 1) * gap;

    return (
        <div className="flex flex-col items-center gap-3">
            <svg
                width={totalWidth}
                height={height}
                viewBox={`0 0 ${totalWidth} ${height}`}
                className="text-glass-blue-400"
            >
                {Array.from({ length: bars }).map((_, i) => {
                    const x = i * (barWidth + gap);
                    const delay = i * 0.12;
                    return (
                        <rect
                            key={i}
                            x={x}
                            rx={barWidth / 2}
                            width={barWidth}
                            fill="currentColor"
                            opacity={0.8}
                        >
                            <animate
                                attributeName="height"
                                dur="1s"
                                repeatCount="indefinite"
                                begin={`${delay}s`}
                                values={`${height * 0.3};${height};${height * 0.3}`}
                                keyTimes="0;0.5;1"
                                keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
                                calcMode="spline"
                            />
                            <animate
                                attributeName="y"
                                dur="1s"
                                repeatCount="indefinite"
                                begin={`${delay}s`}
                                values={`${height * 0.35};0;${height * 0.35}`}
                                keyTimes="0;0.5;1"
                                keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
                                calcMode="spline"
                            />
                        </rect>
                    );
                })}
            </svg>
            {label && (
                <p className="text-sm text-zinc-400 animate-pulse">{label}</p>
            )}
        </div>
    );
}
