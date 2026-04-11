import type {
  OcctMeshData,
  OcctModule,
  OcctReadParams,
  OcctReadResult,
} from 'occt-import-js';

import * as THREE from 'three';

export type ViewerMesh = {
  key: string;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshPhysicalMaterial;
};

export type CadViewerModel = {
  sourceName: string;
  fileSize: number;
  meshCount: number;
  triangleCount: number;
  meshes: ViewerMesh[];
};

export type ModelRotation = {
  x: number;
  y: number;
  z: number;
};

const triangulationParams: OcctReadParams = {
  linearUnit: 'millimeter',
  linearDeflectionType: 'bounding_box_ratio',
  linearDeflection: 0.0015,
  angularDeflection: 0.35,
};

let occtModulePromise: Promise<OcctModule> | null = null;

function isSupportedCadFile(fileName: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension !== undefined && ['stp', 'step', 'igs', 'iges'].includes(extension);
}

function getCadReader(module: OcctModule, fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'igs' || extension === 'iges') {
    return module.ReadIgesFile.bind(module);
  }
  return module.ReadStepFile.bind(module);
}

function buildMeshColor(mesh: OcctMeshData): THREE.Color {
  const fallback = new THREE.Color('#c8d6f5');
  if (!mesh.color || mesh.color.length !== 3) {
    return fallback;
  }

  const normalized = mesh.color.map((value) => (value > 1 ? value / 255 : value));
  return new THREE.Color(
    normalized[0] ?? 0.78,
    normalized[1] ?? 0.84,
    normalized[2] ?? 0.96,
  );
}

function createThreeMesh(mesh: OcctMeshData, index: number): ViewerMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(mesh.attributes.position.array), 3),
  );
  if (mesh.attributes.normal?.array) {
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array(mesh.attributes.normal.array), 3),
    );
  } else {
    geometry.computeVertexNormals();
  }
  if (mesh.index?.array && mesh.index.array.length > 0) {
    geometry.setIndex(mesh.index.array);
  }
  geometry.computeBoundingSphere();

  const material = new THREE.MeshPhysicalMaterial({
    color: buildMeshColor(mesh),
    metalness: 0.22,
    roughness: 0.34,
    clearcoat: 0.16,
    clearcoatRoughness: 0.28,
  });

  return {
    key: mesh.name || `mesh-${index}`,
    geometry,
    material,
  };
}

function createViewerModel(
  sourceName: string,
  fileSize: number,
  result: OcctReadResult,
): CadViewerModel {
  const meshes = result.meshes.map((mesh, index) => createThreeMesh(mesh, index));
  const triangleCount = result.meshes.reduce((total, mesh) => {
    if (mesh.index?.array?.length) {
      return total + Math.floor(mesh.index.array.length / 3);
    }
    return total + Math.floor(mesh.attributes.position.array.length / 9);
  }, 0);

  return {
    sourceName,
    fileSize,
    meshCount: meshes.length,
    triangleCount,
    meshes,
  };
}

export function disposeCadViewerModel(model: CadViewerModel | null) {
  if (!model) {
    return;
  }

  for (const mesh of model.meshes) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
}

async function getOcctModule(): Promise<OcctModule> {
  if (!occtModulePromise) {
    occtModulePromise = Promise.all([
      import('occt-import-js'),
      import('occt-import-js/dist/occt-import-js.wasm?url'),
    ]).then(([module, wasmUrl]) =>
      module.default({
        locateFile: (path) => (path.endsWith('.wasm') ? wasmUrl.default : path),
      }),
    );
  }

  return occtModulePromise;
}

export async function loadCadViewerModel(
  sourceName: string,
  fileSize: number,
  buffer: ArrayBuffer,
): Promise<CadViewerModel> {
  if (!isSupportedCadFile(sourceName)) {
    throw new Error('unsupported');
  }

  const module = await getOcctModule();
  const read = getCadReader(module, sourceName);
  const result = read(new Uint8Array(buffer), triangulationParams);
  if (!result.success || result.meshes.length === 0) {
    throw new Error('parse_failed');
  }

  return createViewerModel(sourceName, fileSize, result);
}
