import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeCatalogItem,
  WorkflowPortContract,
  WorkflowPortDefinition,
} from '@platform/types';

export const CALL_SUBGRAPH_NODE_TYPE = 'workflow.call_subgraph';
export const FOR_EACH_NODE_TYPE = 'control.for_each';
export const SUBGRAPH_INPUT_NODE_TYPE = 'workflow.subgraph_input';
export const SUBGRAPH_OUTPUT_NODE_TYPE = 'workflow.subgraph_output';
export const FOR_EACH_ITEM_PORT_KEY = 'item';
export const FOR_EACH_INDEX_PORT_KEY = 'index';
export const FOR_EACH_RESERVED_INPUT_PORT_KEYS = new Set([
  FOR_EACH_ITEM_PORT_KEY,
  FOR_EACH_INDEX_PORT_KEY,
]);

export interface WorkflowInterfacePort {
  nodeId: string;
  port: WorkflowPortDefinition;
  contract?: WorkflowPortContract;
}

export interface DynamicNodeShape {
  inputDefs?: WorkflowNode['inputDefs'];
  inputContracts?: WorkflowNode['inputContracts'];
  outputDefs?: WorkflowNode['outputDefs'];
  outputContracts?: WorkflowNode['outputContracts'];
  subgraph?: WorkflowGraph;
}

const DEFAULT_FOR_EACH_INPUT_DEF: WorkflowPortDefinition = {
  key: 'items',
  label: 'Items',
  description: 'Ordered list of values to iterate over.',
  dataTypes: ['value_list'],
  required: true,
};

const DEFAULT_FOR_EACH_INPUT_CONTRACT: WorkflowPortContract = {
  portKey: 'items',
  summary: 'Ordered list of values to iterate over.',
  valueTypes: ['array'],
};

function clonePort(port: WorkflowPortDefinition): WorkflowPortDefinition {
  return {
    key: port.key,
    label: port.label,
    description: port.description,
    dataTypes: [...port.dataTypes],
    required: port.required,
  };
}

function cloneContract(contract: WorkflowPortContract): WorkflowPortContract {
  return {
    ...contract,
    datasetKinds: [...(contract.datasetKinds ?? [])],
    fileFormats: [...(contract.fileFormats ?? [])],
    columnRequirements: [...(contract.columnRequirements ?? [])],
    sampleColumns: [...(contract.sampleColumns ?? [])],
    producedColumns: [...(contract.producedColumns ?? [])],
    taskTypes: [...(contract.taskTypes ?? [])],
    annotationKinds: [...(contract.annotationKinds ?? [])],
    sampleKinds: [...(contract.sampleKinds ?? [])],
    valueTypes: [...(contract.valueTypes ?? [])],
    notes: [...(contract.notes ?? [])],
  };
}

function mergePortOverrides(
  nodePorts: WorkflowPortDefinition[],
  definitionPorts: WorkflowPortDefinition[],
): WorkflowPortDefinition[] {
  const definitionByKey = new Map(definitionPorts.map((port) => [port.key, port]));
  return nodePorts.map((port) => {
    if (port.dataTypes.length) {
      return clonePort(port);
    }
    return clonePort(definitionByKey.get(port.key) ?? port);
  });
}

function orderedBoundaryNodes(subgraph: WorkflowGraph | undefined, nodeType: string): WorkflowNode[] {
  return [...(subgraph?.nodes ?? [])]
    .filter((node) => node.type === nodeType)
    .sort((left, right) => {
      if (left.position.y !== right.position.y) {
        return left.position.y - right.position.y;
      }
      if (left.position.x !== right.position.x) {
        return left.position.x - right.position.x;
      }
      return left.id.localeCompare(right.id);
    });
}

function collectBoundaryPorts(
  subgraph: WorkflowGraph | undefined,
  nodeType: string,
  kind: 'input' | 'output',
): WorkflowInterfacePort[] {
  const items: WorkflowInterfacePort[] = [];
  for (const node of orderedBoundaryNodes(subgraph, nodeType)) {
    const ports = kind === 'input' ? node.inputDefs ?? [] : node.outputDefs ?? [];
    const contracts = kind === 'input' ? node.inputContracts ?? [] : node.outputContracts ?? [];
    const contractByKey = new Map(contracts.map((contract) => [contract.portKey, contract]));
    for (const port of ports) {
      items.push({
        nodeId: node.id,
        port: clonePort(port),
        contract: contractByKey.get(port.key) ? cloneContract(contractByKey.get(port.key)!) : undefined,
      });
    }
  }
  return items;
}

export function deriveSubgraphInputs(subgraph: WorkflowGraph | undefined): WorkflowInterfacePort[] {
  return collectBoundaryPorts(subgraph, SUBGRAPH_INPUT_NODE_TYPE, 'output');
}

export function deriveSubgraphOutputs(subgraph: WorkflowGraph | undefined): WorkflowInterfacePort[] {
  return collectBoundaryPorts(subgraph, SUBGRAPH_OUTPUT_NODE_TYPE, 'input');
}

export function isStructuralSubgraphNodeType(nodeType: string): boolean {
  return nodeType === CALL_SUBGRAPH_NODE_TYPE || nodeType === FOR_EACH_NODE_TYPE;
}

function forEachStaticInputDefs(node: WorkflowNode): WorkflowPortDefinition[] {
  const preserved = (node.inputDefs ?? []).filter((port) => port.key === DEFAULT_FOR_EACH_INPUT_DEF.key);
  return (preserved.length ? preserved : [DEFAULT_FOR_EACH_INPUT_DEF]).map(clonePort);
}

function forEachStaticInputContracts(node: WorkflowNode): WorkflowPortContract[] {
  const preserved = (node.inputContracts ?? []).filter(
    (contract) => contract.portKey === DEFAULT_FOR_EACH_INPUT_CONTRACT.portKey,
  );
  return (preserved.length ? preserved : [DEFAULT_FOR_EACH_INPUT_CONTRACT]).map(cloneContract);
}

function deriveStructuralInputs(
  node: WorkflowNode,
  definition?: WorkflowNodeCatalogItem,
): WorkflowInterfacePort[] {
  if (!node.subgraph) {
    return [];
  }

  if (node.type === CALL_SUBGRAPH_NODE_TYPE) {
    return deriveSubgraphInputs(node.subgraph);
  }

  if (node.type !== FOR_EACH_NODE_TYPE) {
    return [];
  }

  const reservedKeys = new Set([
    ...FOR_EACH_RESERVED_INPUT_PORT_KEYS,
    DEFAULT_FOR_EACH_INPUT_DEF.key,
    ...(definition?.inputs ?? []).map((port) => port.key),
  ]);
  return deriveSubgraphInputs(node.subgraph).filter((item) => !reservedKeys.has(item.port.key));
}

function deriveStructuralOutputs(node: WorkflowNode): WorkflowInterfacePort[] {
  if (!node.subgraph) {
    return [];
  }

  if (node.type === CALL_SUBGRAPH_NODE_TYPE) {
    return deriveSubgraphOutputs(node.subgraph);
  }

  if (node.type !== FOR_EACH_NODE_TYPE) {
    return [];
  }

  return deriveSubgraphOutputs(node.subgraph).map((item) => ({
    nodeId: item.nodeId,
    port: {
      ...clonePort(item.port),
      dataTypes: ['value_list'],
    },
    contract: item.contract
      ? {
          ...cloneContract(item.contract),
          summary: item.contract.summary?.trim()
            ? `Aggregated list of per-iteration outputs whose items satisfy: ${item.contract.summary.trim()}`
            : 'Aggregated list of per-iteration outputs.',
          notes: [
            ...(item.contract.notes ?? []),
            `Produced by ${FOR_EACH_NODE_TYPE} from nested output \`${item.port.key}\`.`,
          ],
        }
      : undefined,
  }));
}

export function getEffectiveNodeInputDefs(
  node: WorkflowNode,
  definition?: WorkflowNodeCatalogItem,
): WorkflowPortDefinition[] {
  if (isStructuralSubgraphNodeType(node.type) && node.subgraph) {
    const structuralInputs = deriveStructuralInputs(node, definition).map((item) => clonePort(item.port));
    if (node.type === FOR_EACH_NODE_TYPE) {
      return [...forEachStaticInputDefs(node), ...structuralInputs];
    }
    return structuralInputs;
  }
  if (node.inputDefs?.length) {
    return mergePortOverrides(node.inputDefs, definition?.inputs ?? []);
  }
  return (definition?.inputs ?? []).map(clonePort);
}

export function getEffectiveNodeOutputDefs(
  node: WorkflowNode,
  definition?: WorkflowNodeCatalogItem,
): WorkflowPortDefinition[] {
  if (isStructuralSubgraphNodeType(node.type) && node.subgraph) {
    return deriveStructuralOutputs(node).map((item) => clonePort(item.port));
  }
  if (node.outputDefs?.length) {
    return mergePortOverrides(node.outputDefs, definition?.outputs ?? []);
  }
  return (definition?.outputs ?? []).map(clonePort);
}

export function getEffectiveInputContracts(
  node: WorkflowNode,
  definition?: WorkflowNodeCatalogItem,
): WorkflowPortContract[] {
  if (isStructuralSubgraphNodeType(node.type) && node.subgraph) {
    const structuralContracts = deriveStructuralInputs(node, definition)
      .flatMap((item) => (item.contract ? [cloneContract(item.contract)] : []));
    if (node.type === FOR_EACH_NODE_TYPE) {
      return [...forEachStaticInputContracts(node), ...structuralContracts];
    }
    return structuralContracts;
  }
  if (node.inputContracts?.length) {
    return node.inputContracts.map(cloneContract);
  }
  return (definition?.inputContracts ?? []).map(cloneContract);
}

export function getEffectiveOutputContracts(
  node: WorkflowNode,
  definition?: WorkflowNodeCatalogItem,
): WorkflowPortContract[] {
  if (isStructuralSubgraphNodeType(node.type) && node.subgraph) {
    return deriveStructuralOutputs(node)
      .flatMap((item) => (item.contract ? [cloneContract(item.contract)] : []));
  }
  if (node.outputContracts?.length) {
    return node.outputContracts.map(cloneContract);
  }
  return (definition?.outputContracts ?? []).map(cloneContract);
}

function createDefaultForEachSubgraph(): WorkflowGraph {
  return {
    nodes: [
      {
        id: 'loop-item',
        type: SUBGRAPH_INPUT_NODE_TYPE,
        position: { x: 40, y: 80 },
        params: {},
        inputBindings: {},
        inputDefs: [],
        inputContracts: [],
        outputDefs: [{ key: FOR_EACH_ITEM_PORT_KEY, label: 'Item', dataTypes: ['value'], required: true }],
        outputContracts: [{ portKey: FOR_EACH_ITEM_PORT_KEY, summary: 'Current loop item.' }],
      },
      {
        id: 'loop-index',
        type: SUBGRAPH_INPUT_NODE_TYPE,
        position: { x: 40, y: 220 },
        params: {},
        inputBindings: {},
        inputDefs: [],
        inputContracts: [],
        outputDefs: [{ key: FOR_EACH_INDEX_PORT_KEY, label: 'Index', dataTypes: ['value'], required: true }],
        outputContracts: [
          { portKey: FOR_EACH_INDEX_PORT_KEY, summary: 'Zero-based loop index.', valueTypes: ['number'] },
        ],
      },
    ],
    edges: [],
  };
}

export function syncStructuralNodeInterfaces(node: WorkflowNode): WorkflowNode {
  if (!isStructuralSubgraphNodeType(node.type)) {
    return node;
  }
  const subgraph =
    node.subgraph ?? (node.type === FOR_EACH_NODE_TYPE ? createDefaultForEachSubgraph() : { nodes: [], edges: [] });
  const inputDefs =
    node.type === FOR_EACH_NODE_TYPE
      ? [...forEachStaticInputDefs(node), ...deriveStructuralInputs({ ...node, subgraph }, undefined).map((item) => clonePort(item.port))]
      : deriveStructuralInputs({ ...node, subgraph }, undefined).map((item) => clonePort(item.port));
  const inputContracts =
    node.type === FOR_EACH_NODE_TYPE
      ? [
          ...forEachStaticInputContracts(node),
          ...deriveStructuralInputs({ ...node, subgraph }, undefined)
            .flatMap((item) => (item.contract ? [cloneContract(item.contract)] : [])),
        ]
      : deriveStructuralInputs({ ...node, subgraph }, undefined)
          .flatMap((item) => (item.contract ? [cloneContract(item.contract)] : []));
  return {
    ...node,
    subgraph,
    inputDefs,
    inputContracts,
    outputDefs: deriveStructuralOutputs({ ...node, subgraph }).map((item) => clonePort(item.port)),
    outputContracts: deriveStructuralOutputs({ ...node, subgraph })
      .flatMap((item) => (item.contract ? [cloneContract(item.contract)] : [])),
  };
}

export const syncCallSubgraphNodeInterfaces = syncStructuralNodeInterfaces;

export function createDefaultDynamicNodeShape(nodeType: string): DynamicNodeShape {
  if (nodeType === SUBGRAPH_INPUT_NODE_TYPE) {
    return {
      inputDefs: [],
      inputContracts: [],
      outputDefs: [{ key: 'input', label: 'Input', dataTypes: ['value'], required: false }],
      outputContracts: [{ portKey: 'input', summary: 'Subgraph input boundary.' }],
      subgraph: undefined,
    };
  }
  if (nodeType === SUBGRAPH_OUTPUT_NODE_TYPE) {
    return {
      inputDefs: [{ key: 'output', label: 'Output', dataTypes: ['value'], required: true }],
      inputContracts: [{ portKey: 'output', summary: 'Subgraph output boundary.' }],
      outputDefs: [],
      outputContracts: [],
      subgraph: undefined,
    };
  }
  if (nodeType === CALL_SUBGRAPH_NODE_TYPE) {
    return {
      inputDefs: [],
      inputContracts: [],
      outputDefs: [],
      outputContracts: [],
      subgraph: { nodes: [], edges: [] },
    };
  }
  if (nodeType === FOR_EACH_NODE_TYPE) {
    return {
      inputDefs: [clonePort(DEFAULT_FOR_EACH_INPUT_DEF)],
      inputContracts: [cloneContract(DEFAULT_FOR_EACH_INPUT_CONTRACT)],
      outputDefs: [],
      outputContracts: [],
      subgraph: createDefaultForEachSubgraph(),
    };
  }
  return {
    inputDefs: undefined,
    inputContracts: undefined,
    outputDefs: undefined,
    outputContracts: undefined,
    subgraph: undefined,
  };
}

export function isSubgraphBoundaryNode(nodeType: string): boolean {
  return nodeType === SUBGRAPH_INPUT_NODE_TYPE || nodeType === SUBGRAPH_OUTPUT_NODE_TYPE;
}
