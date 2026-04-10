declare module 'occt-import-js' {
  export interface OcctImportNode {
    name?: string;
    meshes?: number[];
    children?: OcctImportNode[];
  }

  export interface OcctMeshAttributeArray {
    array: number[];
  }

  export interface OcctMeshAttributes {
    position: OcctMeshAttributeArray;
    normal?: OcctMeshAttributeArray;
  }

  export interface OcctMeshData {
    name?: string;
    color?: [number, number, number];
    attributes: OcctMeshAttributes;
    index: { array: number[] };
  }

  export interface OcctReadResult {
    success: boolean;
    root?: OcctImportNode;
    meshes: OcctMeshData[];
  }

  export interface OcctReadParams {
    linearUnit?: 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot';
    linearDeflectionType?: 'bounding_box_ratio' | 'absolute_value';
    linearDeflection?: number;
    angularDeflection?: number;
  }

  export interface OcctModule {
    ReadStepFile(content: Uint8Array, params: OcctReadParams | null): OcctReadResult;
    ReadIgesFile(content: Uint8Array, params: OcctReadParams | null): OcctReadResult;
    ReadBrepFile(content: Uint8Array, params: OcctReadParams | null): OcctReadResult;
  }

  export interface OcctFactoryOptions {
    locateFile?: (path: string, prefix?: string) => string;
  }

  export default function occtimportjs(options?: OcctFactoryOptions): Promise<OcctModule>;
}
