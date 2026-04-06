"use client";

import { useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import * as THREE from "three";

const ACCENT = "#A7C7E7";
const STRAT_RED = "#B91C1C";
const STRAT_RED_DARK = "#8B1515";
const PICKGUARD = "#FFFDE8";
const MAPLE = "#D4A562";
const CHROME = "#C0C0C0";
const ROSEWOOD = "#3E1F0D";

// ── Strat-style Electric Guitar (Red) ─────────────────────────────────
function StratGuitarModel() {
    const groupRef = useRef<THREE.Group>(null!);
    useFrame((_, delta) => {
        groupRef.current.rotation.y += delta * 0.12;
        groupRef.current.rotation.x = Math.sin(Date.now() * 0.0008) * 0.04;
    });

    // Strat body outline using THREE.Shape (double cutaway silhouette)
    const bodyShape = useMemo(() => {
        const shape = new THREE.Shape();
        // Start at bottom center of body
        shape.moveTo(0, -1.1);
        // Bottom curve (round belly)
        shape.bezierCurveTo(0.7, -1.15, 1.1, -0.8, 1.15, -0.3);
        // Right waist (treble cutaway)
        shape.bezierCurveTo(1.15, 0.0, 0.85, 0.2, 0.7, 0.3);
        // Upper right horn
        shape.bezierCurveTo(0.55, 0.4, 0.5, 0.7, 0.55, 1.0);
        shape.bezierCurveTo(0.58, 1.15, 0.5, 1.25, 0.35, 1.25);
        // Neck pocket
        shape.bezierCurveTo(0.2, 1.22, 0.15, 1.1, 0.14, 0.9);
        shape.lineTo(-0.14, 0.9);
        // Upper left horn (deeper bass cutaway)
        shape.bezierCurveTo(-0.15, 1.15, -0.2, 1.35, -0.35, 1.45);
        shape.bezierCurveTo(-0.55, 1.55, -0.65, 1.45, -0.65, 1.25);
        shape.bezierCurveTo(-0.65, 1.0, -0.5, 0.7, -0.55, 0.4);
        // Left waist
        shape.bezierCurveTo(-0.7, 0.25, -1.0, 0.05, -1.1, -0.2);
        // Bottom left curve
        shape.bezierCurveTo(-1.15, -0.7, -0.8, -1.1, 0, -1.1);
        return shape;
    }, []);

    const bodyExtrudeSettings = useMemo(
        () => ({ depth: 0.18, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 3 }),
        []
    );

    return (
        <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.4}>
            <group ref={groupRef} scale={0.7} rotation={[0.2, 0.4, -0.1]}>
                {/* Body */}
                <mesh rotation={[0, 0, 0]} position={[0, -0.2, -0.09]}>
                    <extrudeGeometry args={[bodyShape, bodyExtrudeSettings]} />
                    <meshStandardMaterial color={STRAT_RED} roughness={0.15} metalness={0.3} />
                </mesh>
                {/* Body edge/binding accent */}
                <mesh rotation={[0, 0, 0]} position={[0, -0.2, -0.095]}>
                    <extrudeGeometry args={[bodyShape, { depth: 0.19, bevelEnabled: false }]} />
                    <meshStandardMaterial color={STRAT_RED_DARK} roughness={0.3} metalness={0.2} transparent opacity={0.15} />
                </mesh>

                {/* Pickguard (slightly raised cream overlay) */}
                <mesh position={[0.15, -0.15, 0.1]}>
                    <planeGeometry args={[1.3, 1.6]} />
                    <meshStandardMaterial color={PICKGUARD} roughness={0.5} metalness={0.05} transparent opacity={0.85} side={THREE.DoubleSide} />
                </mesh>

                {/* 3 Single-coil pickups */}
                {[-0.45, -0.1, 0.25].map((y, i) => (
                    <group key={i} position={[0.05, y, 0.12]}>
                        <mesh>
                            <boxGeometry args={[0.45, 0.12, 0.05]} />
                            <meshStandardMaterial color={i === 2 ? "#222" : PICKGUARD} roughness={0.4} metalness={0.1} />
                        </mesh>
                        {/* Pole pieces */}
                        {[-0.14, -0.084, -0.028, 0.028, 0.084, 0.14].map((x, j) => (
                            <mesh key={j} position={[x, 0, 0.03]}>
                                <cylinderGeometry args={[0.012, 0.012, 0.04, 6]} />
                                <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.1} />
                            </mesh>
                        ))}
                    </group>
                ))}

                {/* Bridge / tremolo */}
                <mesh position={[0.05, -0.65, 0.12]}>
                    <boxGeometry args={[0.5, 0.18, 0.06]} />
                    <meshStandardMaterial color={CHROME} roughness={0.1} metalness={0.95} />
                </mesh>
                {/* Tremolo arm */}
                <mesh position={[0.3, -0.75, 0.14]} rotation={[0, 0, -0.3]}>
                    <cylinderGeometry args={[0.01, 0.01, 0.5, 6]} />
                    <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.1} />
                </mesh>

                {/* Neck */}
                <mesh position={[0, 1.8, 0.02]}>
                    <boxGeometry args={[0.24, 2.4, 0.12]} />
                    <meshStandardMaterial color={MAPLE} roughness={0.35} metalness={0.1} />
                </mesh>
                {/* Fretboard */}
                <mesh position={[0, 1.8, 0.08]}>
                    <boxGeometry args={[0.22, 2.4, 0.02]} />
                    <meshStandardMaterial color={ROSEWOOD} roughness={0.6} metalness={0.05} />
                </mesh>
                {/* Frets */}
                {Array.from({ length: 12 }, (_, i) => (
                    <mesh key={i} position={[0, 0.7 + i * 0.18, 0.1]}>
                        <boxGeometry args={[0.22, 0.01, 0.015]} />
                        <meshStandardMaterial color={CHROME} metalness={0.95} roughness={0.05} />
                    </mesh>
                ))}
                {/* Fret markers (dots) */}
                {[2, 4, 6, 8, 11].map((fret) => (
                    <mesh key={fret} position={[0, 0.7 + fret * 0.18, 0.1]}>
                        <circleGeometry args={[0.02, 8]} />
                        <meshStandardMaterial color={PICKGUARD} />
                    </mesh>
                ))}

                {/* Headstock */}
                <mesh position={[0, 3.15, 0.02]}>
                    <boxGeometry args={[0.32, 0.7, 0.1]} />
                    <meshStandardMaterial color={MAPLE} roughness={0.35} metalness={0.1} />
                </mesh>
                {/* Tuning pegs (6 in-line, Fender style) */}
                {Array.from({ length: 6 }, (_, i) => (
                    <group key={i} position={[-0.12 + i * 0.045, 2.9 + i * 0.08, -0.06]}>
                        <mesh>
                            <cylinderGeometry args={[0.025, 0.025, 0.04, 8]} />
                            <meshStandardMaterial color={CHROME} metalness={0.95} roughness={0.1} />
                        </mesh>
                    </group>
                ))}

                {/* Strings (6) */}
                {[-0.07, -0.042, -0.014, 0.014, 0.042, 0.07].map((x, i) => (
                    <mesh key={i} position={[x, 1.2, 0.14]}>
                        <cylinderGeometry args={[0.004 - i * 0.0003, 0.004 - i * 0.0003, 3.8, 4]} />
                        <meshStandardMaterial color={CHROME} emissive={ACCENT} emissiveIntensity={0.15} metalness={0.9} roughness={0.2} transparent opacity={0.6} />
                    </mesh>
                ))}

                {/* Control knobs (volume + 2 tone) */}
                {([[-0.35, -0.55], [-0.3, -0.75], [-0.25, -0.95]] as [number, number][]).map(([x, y], i) => (
                    <mesh key={i} position={[x, y, 0.13]}>
                        <cylinderGeometry args={[0.05, 0.05, 0.03, 12]} />
                        <meshStandardMaterial color={i === 0 ? "#222" : "#333"} roughness={0.3} metalness={0.5} />
                    </mesh>
                ))}

                {/* 5-way switch */}
                <mesh position={[-0.4, -0.3, 0.13]}>
                    <cylinderGeometry args={[0.015, 0.025, 0.06, 8]} />
                    <meshStandardMaterial color={PICKGUARD} roughness={0.4} />
                </mesh>
            </group>
        </Float>
    );
}

// ── Synthesizer / Keyboard (Realistic) ────────────────────────────────
function SynthModel() {
    const groupRef = useRef<THREE.Group>(null!);
    useFrame((_, delta) => {
        groupRef.current.rotation.y += delta * 0.1;
        groupRef.current.rotation.z = Math.sin(Date.now() * 0.0007) * 0.02;
    });

    // Piano key layout: C through B, two octaves + extra C
    const keys = useMemo(() => {
        const result: { x: number; isBlack: boolean; offset: number }[] = [];
        // White keys first (proper spacing)
        const whitePattern = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B semitones
        const whiteWidth = 0.22;
        let whiteIndex = 0;

        // Generate 2 octaves of white keys
        for (let oct = 0; oct < 2; oct++) {
            for (const _ of whitePattern) {
                result.push({ x: -1.65 + whiteIndex * (whiteWidth + 0.01), isBlack: false, offset: 0 });
                whiteIndex++;
            }
        }
        // Extra final C
        result.push({ x: -1.65 + whiteIndex * (whiteWidth + 0.01), isBlack: false, offset: 0 });

        // Black keys (positioned between white keys)
        // For each octave, black keys go at positions: after 1st, 2nd, 4th, 5th, 6th white key
        for (let oct = 0; oct < 2; oct++) {
            const baseWhite = oct * 7;
            const blackPositions = [0, 1, 3, 4, 5]; // Which white key gap
            for (const bp of blackPositions) {
                const leftWhiteX = -1.65 + (baseWhite + bp) * (whiteWidth + 0.01);
                const blackX = leftWhiteX + whiteWidth * 0.6;
                result.push({ x: blackX, isBlack: true, offset: 0.05 });
            }
        }

        return result;
    }, []);

    return (
        <Float speed={1.0} rotationIntensity={0.1} floatIntensity={0.3}>
            <group ref={groupRef} scale={0.45} rotation={[0.4, -0.3, 0.05]}>
                {/* Main body — darker housing */}
                <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[4.2, 0.4, 2.2]} />
                    <meshStandardMaterial color="#1a1a1a" roughness={0.15} metalness={0.6} />
                </mesh>
                {/* Top panel (slightly lighter) */}
                <mesh position={[0, 0.21, -0.35]}>
                    <boxGeometry args={[4.0, 0.02, 1.3]} />
                    <meshStandardMaterial color="#252525" roughness={0.25} metalness={0.4} />
                </mesh>
                {/* Front lip (red accent) */}
                <mesh position={[0, 0.15, 1.05]}>
                    <boxGeometry args={[4.2, 0.06, 0.08]} />
                    <meshStandardMaterial color={STRAT_RED} emissive={STRAT_RED} emissiveIntensity={0.2} roughness={0.3} metalness={0.4} />
                </mesh>

                {/* White keys */}
                {keys.filter(k => !k.isBlack).map((k, i) => (
                    <mesh key={`w${i}`} position={[k.x, 0.23, 0.55]} scale={[0.22, 0.07, 0.6]}>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshStandardMaterial color="#F0F0F0" roughness={0.35} metalness={0.05} />
                    </mesh>
                ))}
                {/* Black keys (raised and narrower) */}
                {keys.filter(k => k.isBlack).map((k, i) => (
                    <mesh key={`b${i}`} position={[k.x, 0.3, 0.4]} scale={[0.13, 0.1, 0.38]}>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshStandardMaterial color="#111" roughness={0.2} metalness={0.3} />
                    </mesh>
                ))}

                {/* Knobs row (with colored caps) */}
                {Array.from({ length: 9 }, (_, i) => (
                    <group key={i} position={[-1.6 + i * 0.4, 0.27, -0.65]}>
                        <mesh>
                            <cylinderGeometry args={[0.07, 0.07, 0.06, 12]} />
                            <meshStandardMaterial color="#2a2a2a" roughness={0.2} metalness={0.7} />
                        </mesh>
                        {/* Indicator line */}
                        <mesh position={[0, 0.035, 0]} rotation={[0, i * 0.7, 0]}>
                            <boxGeometry args={[0.005, 0.005, 0.06]} />
                            <meshStandardMaterial color={i % 3 === 0 ? ACCENT : i % 3 === 1 ? "#ef4444" : "#22c55e"} emissive={i % 3 === 0 ? ACCENT : i % 3 === 1 ? "#ef4444" : "#22c55e"} emissiveIntensity={0.6} />
                        </mesh>
                    </group>
                ))}

                {/* Pitch / mod wheels */}
                {[0, 1].map((i) => (
                    <group key={i} position={[-2.0, 0.27, 0.1 + i * 0.25]}>
                        <mesh rotation={[0, 0, Math.PI / 2]}>
                            <cylinderGeometry args={[0.06, 0.06, 0.03, 12]} />
                            <meshStandardMaterial color="#333" roughness={0.2} metalness={0.6} />
                        </mesh>
                    </group>
                ))}

                {/* LED strip (accent glow) */}
                <mesh position={[0, 0.22, -0.98]}>
                    <boxGeometry args={[3.8, 0.015, 0.03]} />
                    <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={1.0} transparent opacity={0.7} />
                </mesh>

                {/* Display screen */}
                <mesh position={[0, 0.23, -0.55]}>
                    <planeGeometry args={[0.9, 0.4]} />
                    <meshStandardMaterial color="#050510" emissive={ACCENT} emissiveIntensity={0.12} />
                </mesh>
                {/* Screen bezel */}
                <mesh position={[0, 0.225, -0.55]}>
                    <planeGeometry args={[0.95, 0.45]} />
                    <meshStandardMaterial color="#111" />
                </mesh>

                {/* Fader sliders */}
                {Array.from({ length: 4 }, (_, i) => (
                    <group key={i} position={[1.2 + i * 0.25, 0.24, -0.55]}>
                        {/* Track */}
                        <mesh>
                            <boxGeometry args={[0.02, 0.01, 0.35]} />
                            <meshStandardMaterial color="#333" roughness={0.3} metalness={0.5} />
                        </mesh>
                        {/* Slider cap */}
                        <mesh position={[0, 0.01, -0.05 + i * 0.04]}>
                            <boxGeometry args={[0.05, 0.02, 0.06]} />
                            <meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.15} />
                        </mesh>
                    </group>
                ))}
            </group>
        </Float>
    );
}

// ── Condenser Microphone (Realistic) ─────────────────────────────────
function MicrophoneModel() {
    const groupRef = useRef<THREE.Group>(null!);
    useFrame((_, delta) => {
        groupRef.current.rotation.y += delta * 0.14;
        groupRef.current.rotation.x = Math.sin(Date.now() * 0.0009) * 0.03;
    });

    return (
        <Float speed={1.4} rotationIntensity={0.15} floatIntensity={0.4}>
            <group ref={groupRef} scale={0.55} rotation={[0.1, 0.2, -0.08]}>
                {/* Capsule head (large-diaphragm condenser style) */}
                <mesh position={[0, 1.7, 0]}>
                    <capsuleGeometry args={[0.32, 0.65, 16, 20]} />
                    <meshStandardMaterial color="#2F2F2F" roughness={0.12} metalness={0.85} />
                </mesh>
                {/* Grille mesh (wireframe overlay) */}
                <mesh position={[0, 1.7, 0]}>
                    <capsuleGeometry args={[0.33, 0.66, 8, 12]} />
                    <meshStandardMaterial color="#444" wireframe transparent opacity={0.2} />
                </mesh>
                {/* Grille detail lines (horizontal rings) */}
                {[-0.15, 0, 0.15, 0.3].map((y, i) => (
                    <mesh key={i} position={[0, 1.55 + y, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <torusGeometry args={[0.33, 0.005, 4, 24]} />
                        <meshStandardMaterial color="#3a3a3a" metalness={0.8} roughness={0.2} />
                    </mesh>
                ))}

                {/* Gold accent ring between head and body */}
                <mesh position={[0, 1.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.33, 0.02, 8, 24]} />
                    <meshStandardMaterial color="#C5A55A" emissive="#C5A55A" emissiveIntensity={0.2} metalness={0.9} roughness={0.1} />
                </mesh>
                {/* Second accent ring */}
                <mesh position={[0, 1.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.3, 0.015, 8, 24]} />
                    <meshStandardMaterial color="#888" metalness={0.85} roughness={0.15} />
                </mesh>

                {/* Body tube */}
                <mesh position={[0, 0.4, 0]}>
                    <cylinderGeometry args={[0.15, 0.17, 1.5, 16]} />
                    <meshStandardMaterial color="#222" roughness={0.15} metalness={0.75} />
                </mesh>
                {/* Body brand plate (small rectangle) */}
                <mesh position={[0, 0.6, 0.165]} rotation={[0, 0, 0]}>
                    <planeGeometry args={[0.12, 0.25]} />
                    <meshStandardMaterial color="#333" metalness={0.6} roughness={0.3} />
                </mesh>

                {/* Pattern switch */}
                <mesh position={[0, 0.15, 0.17]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.025, 0.025, 0.04, 8]} />
                    <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.1} />
                </mesh>

                {/* LED indicator */}
                <mesh position={[0, 0.9, 0.17]}>
                    <sphereGeometry args={[0.018, 8, 8]} />
                    <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2.5} />
                </mesh>

                {/* Shock mount ring */}
                <mesh position={[0, -0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.4, 0.025, 8, 24]} />
                    <meshStandardMaterial color="#222" metalness={0.7} roughness={0.2} />
                </mesh>
                {/* Shock mount elastic bands */}
                {[0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI, (4 * Math.PI) / 3, (5 * Math.PI) / 3].map((angle, i) => (
                    <mesh key={i} position={[Math.cos(angle) * 0.28, -0.05, Math.sin(angle) * 0.28]} rotation={[0.3, angle, 0]}>
                        <cylinderGeometry args={[0.006, 0.006, 0.55, 4]} />
                        <meshStandardMaterial color="#444" roughness={0.6} />
                    </mesh>
                ))}

                {/* Stand adapter */}
                <mesh position={[0, -0.5, 0]}>
                    <cylinderGeometry args={[0.06, 0.08, 0.3, 10]} />
                    <meshStandardMaterial color="#1a1a1a" metalness={0.7} roughness={0.2} />
                </mesh>

                {/* Stand tube */}
                <mesh position={[0, -1.3, 0]}>
                    <cylinderGeometry args={[0.035, 0.045, 1.3, 8]} />
                    <meshStandardMaterial color="#1a1a1a" metalness={0.6} roughness={0.25} />
                </mesh>

                {/* Base (heavy disc) */}
                <mesh position={[0, -1.95, 0]}>
                    <cylinderGeometry args={[0.45, 0.5, 0.07, 20]} />
                    <meshStandardMaterial color="#151515" metalness={0.7} roughness={0.2} />
                </mesh>
                {/* Base accent ring */}
                <mesh position={[0, -1.91, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.47, 0.01, 6, 24]} />
                    <meshStandardMaterial color="#333" metalness={0.8} roughness={0.15} />
                </mesh>
            </group>
        </Float>
    );
}

// ── Shared Scene Wrapper ──────────────────────────────────────────────
function SceneWrapper({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`absolute pointer-events-none select-none ${className ?? ""}`}>
            <Canvas
                camera={{ position: [0, 0, 6], fov: 40 }}
                dpr={[1, 1.5]}
                gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
                style={{ background: "transparent" }}
            >
                <ambientLight intensity={0.4} />
                <directionalLight position={[3, 4, 5]} intensity={0.7} color="#ffffff" />
                <pointLight position={[-3, 2, 2]} intensity={0.5} color={ACCENT} />
                <pointLight position={[2, -1, 3]} intensity={0.3} color="#ff6666" />
                <Suspense fallback={null}>
                    {children}
                </Suspense>
            </Canvas>
        </div>
    );
}

// ── Exported Positioned Scenes ────────────────────────────────────────

/** Red Strat guitar — displayed alongside "Unmistakably human" card */
export function GuitarScene() {
    return (
        <SceneWrapper className="hidden lg:block right-0 top-1/2 -translate-y-1/2 w-[360px] h-[440px] -mr-6 opacity-70">
            <StratGuitarModel />
        </SceneWrapper>
    );
}

/** Synthesizer — displayed to the RIGHT of "Real people, real music" card */
export function SynthScene() {
    return (
        <SceneWrapper className="hidden lg:block right-0 top-1/2 -translate-y-1/2 w-[380px] h-[420px] -mr-6 opacity-65">
            <SynthModel />
        </SceneWrapper>
    );
}

/** Microphone — displayed to the LEFT of "Real people, real music" card */
export function MicrophoneScene() {
    return (
        <SceneWrapper className="hidden lg:block left-0 top-1/2 -translate-y-1/2 w-[320px] h-[400px] -ml-6 opacity-65">
            <MicrophoneModel />
        </SceneWrapper>
    );
}
