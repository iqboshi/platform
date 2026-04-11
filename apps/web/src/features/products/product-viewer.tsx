import { Bounds, Center, ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { CadViewerModel, ModelRotation } from './product-viewer-runtime';

export function ProductScene({
  model,
  autoRotate,
  rotation,
}: {
  model: CadViewerModel;
  autoRotate: boolean;
  rotation: ModelRotation;
}) {
  return (
    <Canvas
      className="product-canvas"
      camera={{ position: [8, 6, 8], fov: 34 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={1.5} />
      <directionalLight position={[12, 10, 8]} intensity={2.2} />
      <directionalLight position={[-10, -8, -6]} intensity={0.8} />
      <hemisphereLight args={['#ffffff', '#dbe6ff', 0.9]} />
      <Bounds fit clip observe margin={1.16}>
        <Center>
          <group rotation={[rotation.x, rotation.y, rotation.z]}>
            {model.meshes.map((mesh) => (
              <mesh
                key={mesh.key}
                geometry={mesh.geometry}
                material={mesh.material}
                castShadow
                receiveShadow
              />
            ))}
          </group>
        </Center>
      </Bounds>
      <ContactShadows position={[0, -1.6, 0]} opacity={0.24} scale={26} blur={2.5} />
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableDamping
        autoRotate={autoRotate}
        autoRotateSpeed={0.65}
        minDistance={1.8}
        maxDistance={32}
      />
    </Canvas>
  );
}
