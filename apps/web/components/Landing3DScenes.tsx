"use client";

import { useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";

const ACCENT = "#A7C7E7";

// ── Orbiting Music Notes ──────────────────────────────────────────────
function OrbitingNotes({ count = 6, radius = 2.2, speed = 0.3 }: { count?: number; radius?: number; speed?: number }) {
    const groupRef = useRef<THREE.Group>(null!);
    useFrame((_, delta) => { groupRef.current.rotation.y += delta * speed; });

    const notes = useMemo(() =>
        Array.from({ length: count }, (_, i) => {
            const angle = (i / count) * Math.PI * 2;
            const y = (Math.random() - 0.5) * 1.2;
            return { angle, y, scale: 0.08 + Math.random() * 0.06 };
        }), [count]);

    return (
        <group ref={groupRef}>
            {notes.map((n, i) => (
                <group key={i} position={[Math.cos(n.angle) * radius, n.y, Math.sin(n.angle) * radius]}>
                    {/* Note head */}
                    <mesh rotation={[0, 0, -0.3]} scale={n.scale}>
                        <sphereGeometry args={[1, 8, 6]} />
                        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.4} transparent opacity={0.7} />
                    </mesh>
                    {/* Stem */}
                    <mesh position={[n.scale * 0.8, n.scale * 3, 0]} scale={[n.scale * 0.15, n.scale * 6, n.scale * 0.15]}>
                        <cylinderGeometry args={[1, 1, 1, 6]} />
                        <meshStandardMaterial color={ACCENT} transparent opacity={0.5} />
                    </mesh>
                </group>
            ))}
        </group>
    );
}

// ── Electric Guitar (Stylized) ────────────────────────────────────────
function GuitarModel() {
    const groupRef = useRef<THREE.Group>(null!);
    useFrame((_, delta) => {
        groupRef.current.rotation.y += delta * 0.15;
        groupRef.current.rotation.x = Math.sin(Date.now() * 0.001) * 0.05;
    });

    return (
        <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
            <group ref={groupRef} scale={0.55} rotation={[0.1, 0.3, -0.15]}>
                {/* Body */}
                <mesh position={[0, -0.5, 0]}>
                    <capsuleGeometry args={[0.9, 0.8, 8, 16]} />
                    <MeshDistortMaterial color="#1a1a1a" emissive={ACCENT} emissiveIntensity={0.08} roughness={0.3} metalness={0.8} distort={0.05} speed={2} />
                </mesh>
                {/* Sound hole */}
                <mesh position={[0, -0.3, 0.85]}>
                    <torusGeometry args={[0.3, 0.03, 8, 24]} />
                    <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.6} transparent opacity={0.6} />
                </mesh>
                {/* Neck */}
                <mesh position={[0, 1.8, 0]}>
                    <boxGeometry args={[0.22, 2.8, 0.14]} />
                    <meshStandardMaterial color="#222" roughness={0.4} metalness={0.6} />
                </mesh>
                {/* Headstock */}
                <mesh position={[0, 3.4, 0]}>
                    <boxGeometry args={[0.35, 0.6, 0.12]} />
                    <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.7} />
                </mesh>
                {/* Strings */}
                {[-0.06, -0.02, 0.02, 0.06].map((x, i) => (
                    <mesh key={i} position={[x, 1.2, 0.08]}>
                        <cylinderGeometry args={[0.003, 0.003, 4.2, 4]} />
                        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.8} transparent opacity={0.4 + i * 0.1} />
                    </mesh>
                ))}
                {/* Fret markers */}
                {[0.8, 1.4, 2.0, 2.6].map((y, i) => (
                    <mesh key={i} position={[0, y, 0.08]}>
                        <boxGeometry args={[0.2, 0.015, 0.01]} />
                        <meshStandardMaterial color="#444" metalness={0.9} />
                    </mesh>
                ))}
                {/* Pickguard accent glow */}
                <mesh position={[0.3, -0.7, 0.86]}>
                    <circleGeometry args={[0.15, 12]} />
                    <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={1} transparent opacity={0.3} />
                </mesh>
            </group>
        </Float>
    );
}

// ── Synthesizer (Stylized) ────────────────────────────────────────────
function SynthModel() {
    const groupRef = useRef<THREE.Group>(null!);
    useFrame((_, delta) => {
        groupRef.current.rotation.y += delta * 0.12;
        groupRef.current.rotation.z = Math.sin(Date.now() * 0.0008) * 0.03;
    });

    const keys = useMemo(() => {
        const result: { x: number; isBlack: boolean }[] = [];
        const pattern = [false, true, false, true, false, false, true, false, true, false, true, false];
        for (let i = 0; i < 14; i++) {
            result.push({ x: -1.6 + i * 0.24, isBlack: pattern[i % 12]! });
        }
        return result;
    }, []);

    return (
        <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.4}>
            <group ref={groupRef} scale={0.5} rotation={[0.35, -0.4, 0.05]}>
                {/* Main body */}
                <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[4, 0.35, 2]} />
                    <meshStandardMaterial color="#1a1a1a" roughness={0.2} metalness={0.7} />
                </mesh>
                {/* Top panel */}
                <mesh position={[0, 0.19, -0.3]}>
                    <boxGeometry args={[3.8, 0.02, 1.2]} />
                    <meshStandardMaterial color="#222" roughness={0.3} metalness={0.5} />
                </mesh>
                {/* Keys */}
                {keys.map((k, i) => (
                    <mesh key={i} position={[k.x, k.isBlack ? 0.28 : 0.2, 0.55]} scale={k.isBlack ? [0.12, 0.12, 0.35] : [0.2, 0.06, 0.55]}>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshStandardMaterial
                            color={k.isBlack ? "#111" : "#e8e8e8"}
                            emissive={k.isBlack ? "#000" : ACCENT}
                            emissiveIntensity={k.isBlack ? 0 : 0.03}
                            roughness={0.4}
                        />
                    </mesh>
                ))}
                {/* Knobs row */}
                {Array.from({ length: 8 }, (_, i) => (
                    <group key={i} position={[-1.4 + i * 0.4, 0.25, -0.6]}>
                        <mesh>
                            <cylinderGeometry args={[0.08, 0.08, 0.06, 12]} />
                            <meshStandardMaterial color="#333" roughness={0.3} metalness={0.8} />
                        </mesh>
                        <mesh position={[0, 0.035, 0]}>
                            <cylinderGeometry args={[0.06, 0.06, 0.015, 12]} />
                            <meshStandardMaterial color={i % 3 === 0 ? ACCENT : "#555"} emissive={i % 3 === 0 ? ACCENT : "#000"} emissiveIntensity={i % 3 === 0 ? 0.5 : 0} />
                        </mesh>
                    </group>
                ))}
                {/* LED strip */}
                <mesh position={[0, 0.2, -0.95]}>
                    <boxGeometry args={[3.6, 0.02, 0.04]} />
                    <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.8} transparent opacity={0.6} />
                </mesh>
                {/* Display screen */}
                <mesh position={[0, 0.21, -0.55]}>
                    <planeGeometry args={[0.8, 0.35]} />
                    <meshStandardMaterial color="#0a0a0a" emissive={ACCENT} emissiveIntensity={0.15} />
                </mesh>
            </group>
        </Float>
    );
}

// ── Microphone (Stylized Condenser) ──────────────────────────────────
function MicrophoneModel() {
    const groupRef = useRef<THREE.Group>(null!);
    useFrame((_, delta) => {
        groupRef.current.rotation.y += delta * 0.18;
        groupRef.current.rotation.x = Math.sin(Date.now() * 0.0009) * 0.04;
    });

    return (
        <Float speed={1.8} rotationIntensity={0.2} floatIntensity={0.5}>
            <group ref={groupRef} scale={0.6} rotation={[0.1, 0.2, -0.1]}>
                {/* Capsule head */}
                <mesh position={[0, 1.6, 0]}>
                    <capsuleGeometry args={[0.35, 0.7, 12, 16]} />
                    <meshStandardMaterial color="#2a2a2a" roughness={0.15} metalness={0.9} />
                </mesh>
                {/* Grille mesh overlay */}
                <mesh position={[0, 1.6, 0]}>
                    <capsuleGeometry args={[0.36, 0.71, 6, 8]} />
                    <meshStandardMaterial color="#333" wireframe transparent opacity={0.25} />
                </mesh>
                {/* Accent ring */}
                <mesh position={[0, 1.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.36, 0.025, 8, 24]} />
                    <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.8} />
                </mesh>
                {/* Body tube */}
                <mesh position={[0, 0.2, 0]}>
                    <cylinderGeometry args={[0.14, 0.16, 1.6, 12]} />
                    <meshStandardMaterial color="#1a1a1a" roughness={0.2} metalness={0.8} />
                </mesh>
                {/* Mount ring */}
                <mesh position={[0, -0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.2, 0.03, 8, 16]} />
                    <meshStandardMaterial color="#333" metalness={0.9} roughness={0.2} />
                </mesh>
                {/* Stand */}
                <mesh position={[0, -1.4, 0]}>
                    <cylinderGeometry args={[0.04, 0.06, 1.6, 8]} />
                    <meshStandardMaterial color="#222" metalness={0.7} roughness={0.3} />
                </mesh>
                {/* Base */}
                <mesh position={[0, -2.15, 0]}>
                    <cylinderGeometry args={[0.4, 0.45, 0.08, 16]} />
                    <meshStandardMaterial color="#1a1a1a" metalness={0.8} roughness={0.2} />
                </mesh>
                {/* LED indicator */}
                <mesh position={[0, 0.8, 0.15]}>
                    <sphereGeometry args={[0.025, 8, 8]} />
                    <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={2} />
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
                <ambientLight intensity={0.3} />
                <directionalLight position={[3, 4, 5]} intensity={0.6} color="#ffffff" />
                <pointLight position={[-3, 2, 2]} intensity={0.4} color={ACCENT} />
                <Suspense fallback={null}>
                    {children}
                </Suspense>
            </Canvas>
        </div>
    );
}

// ── Exported Positioned Scenes ────────────────────────────────────────

/** Guitar floating on the LEFT side of the Features section */
export function GuitarScene() {
    return (
        <SceneWrapper className="hidden lg:block left-0 top-1/2 -translate-y-1/2 w-[340px] h-[400px] -ml-4 opacity-60">
            <GuitarModel />
            <OrbitingNotes count={5} radius={2.4} speed={0.2} />
        </SceneWrapper>
    );
}

/** Synthesizer floating on the RIGHT side of the Philosophy section */
export function SynthScene() {
    return (
        <SceneWrapper className="hidden lg:block right-0 top-1/2 -translate-y-1/2 w-[380px] h-[420px] -mr-4 opacity-60">
            <SynthModel />
            <OrbitingNotes count={4} radius={2.6} speed={0.25} />
        </SceneWrapper>
    );
}

/** Microphone floating on the LEFT side of the Download section */
export function MicrophoneScene() {
    return (
        <SceneWrapper className="hidden lg:block left-0 top-1/2 -translate-y-1/2 w-[320px] h-[380px] -ml-4 opacity-60">
            <MicrophoneModel />
            <OrbitingNotes count={5} radius={2.2} speed={0.3} />
        </SceneWrapper>
    );
}
