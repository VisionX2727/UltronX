import { Canvas, useFrame } from '@react-three/fiber';
import { useReducedMotion } from 'framer-motion';
import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Mesh, Group } from 'three';

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

function StaticCore({ level, active }: { level: number; active: boolean }) {
  return <div className="orb-fallback" role="img" aria-label="ULTRON energy core visual fallback">
    <span className="orb-fallback-ring ring-one" />
    <span className="orb-fallback-ring ring-two" />
    <span className="orb-fallback-ring ring-three" />
    <span className="orb-fallback-core" style={{ transform: `scale(${1 + (active ? level * 0.08 : 0)})` }} />
  </div>;
}

class CanvasErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Core({ level, active }: { level: number; active: boolean }) {
  const orb = useRef<Mesh>(null);
  const ringOne = useRef<Group>(null);
  const ringTwo = useRef<Group>(null);
  const ringThree = useRef<Group>(null);
  const particles = useRef<Group>(null);
  const reduced = useReducedMotion();
  useFrame((state, delta) => {
    if (reduced) return;
    if (orb.current) {
      orb.current.rotation.y += delta * 0.16;
      const pulse = active ? 1 + Math.min(level, 0.6) * 0.1 : 1;
      orb.current.scale.setScalar(pulse * (1 + Math.sin(state.clock.elapsedTime * 0.8) * 0.012));
    }
    if (ringOne.current) ringOne.current.rotation.z += delta * (active ? 0.12 : 0.035);
    if (ringTwo.current) ringTwo.current.rotation.x += delta * (active ? -0.1 : -0.025);
    if (ringThree.current) ringThree.current.rotation.y += delta * 0.022;
    if (particles.current) {
      particles.current.rotation.y -= delta * 0.018;
      particles.current.position.y = Math.sin(state.clock.elapsedTime * 0.34) * 0.035;
    }
  });
  return (
    <group>
      <mesh ref={orb}>
        <icosahedronGeometry args={[1.04, 5]} />
        <meshStandardMaterial color="#401513" emissive="#bd332b" emissiveIntensity={active ? 1.05 + level * 1.5 : 0.58} roughness={0.3} metalness={0.66} />
      </mesh>
      <group ref={ringOne} rotation={[0.3, 0.4, 0.15]}><mesh><torusGeometry args={[1.42, 0.009, 6, 180]} /><meshBasicMaterial color="#e75b44" transparent opacity={0.82} /></mesh></group>
      <group ref={ringTwo} rotation={[1.1, 0.2, 0.75]}><mesh><torusGeometry args={[1.57, 0.006, 6, 160]} /><meshBasicMaterial color="#b84a32" transparent opacity={0.56} /></mesh></group>
      <group ref={ringThree} rotation={[0.95, 1.25, 0]}><mesh><torusGeometry args={[1.31, 0.004, 5, 160]} /><meshBasicMaterial color="#f0a36a" transparent opacity={0.4} /></mesh></group>
      <group ref={particles}>
        {Array.from({ length: 36 }, (_, i) => {
          const angle = i * 2.399;
          const radius = 1.78 + (i % 5) * 0.055;
          return <mesh key={i} position={[Math.cos(angle) * radius, Math.sin(angle * 1.7) * 0.7, Math.sin(angle) * radius]}>
            <sphereGeometry args={[i % 7 === 0 ? 0.025 : 0.012, 8, 8]} />
            <meshBasicMaterial color={i % 4 === 0 ? '#f08054' : '#be4940'} transparent opacity={i % 3 === 0 ? 0.9 : 0.55} />
          </mesh>;
        })}
      </group>
    </group>
  );
}

export default function Sphere({ level = 0, active = false }: { level?: number; active?: boolean }) {
  const reduced = useReducedMotion();
  const [canUseWebGL] = useState(webglAvailable);
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const updateVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);
  if (!canUseWebGL) return <StaticCore level={level} active={active} />;
  return <CanvasErrorBoundary fallback={<StaticCore level={level} active={active} />}>
    <Canvas frameloop={visible && !reduced ? 'always' : 'demand'} dpr={[1, 1.5]} camera={{ position: [0, 0, 5.2], fov: 38 }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}>
      <Suspense fallback={null}>
        <ambientLight intensity={0.9} />
        <pointLight position={[2, 2, 3]} intensity={18} color="#ee6651" />
        <pointLight position={[-3, -2, 1]} intensity={5} color="#8d231d" />
        <Core level={level} active={active} />
      </Suspense>
    </Canvas>
  </CanvasErrorBoundary>;
}
