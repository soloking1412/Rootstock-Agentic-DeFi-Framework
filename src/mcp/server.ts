import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  getProtocolDataDefinition,
  getProtocolDataHandler,
  simulateSwapDefinition,
  simulateSwapHandler,
  executeIntentDefinition,
  createExecuteIntentHandler,
  getPositionHealthDefinition,
  getPositionHealthHandler,
  getWalletBalancesDefinition,
  getWalletBalancesHandler,
  createSessionDefinition,
  createCreateSessionHandler,
} from './tools/index.js';
import type { SessionService } from '../session/service.js';
import type { PolicyEngine } from '../policy/engine.js';

export interface McpServerDeps {
  sessionService: SessionService;
  policyEngine: PolicyEngine;
}

const TOOL_DEFINITIONS: Tool[] = [
  createSessionDefinition,
  getProtocolDataDefinition,
  simulateSwapDefinition,
  executeIntentDefinition,
  getPositionHealthDefinition,
  getWalletBalancesDefinition,
];

export function createMcpServer(deps: McpServerDeps): Server {
  const server = new Server(
    {
      name: 'rootstock-agentic-defi',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const executeIntentHandler = createExecuteIntentHandler({
    sessionService: deps.sessionService,
    policyEngine: deps.policyEngine,
  });

  const createSessionHandler = createCreateSessionHandler({
    sessionService: deps.sessionService,
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'create_session':
        return createSessionHandler(args);
      case 'get_protocol_data':
        return getProtocolDataHandler(args);
      case 'simulate_swap':
        return simulateSwapHandler(args);
      case 'execute_intent':
        return executeIntentHandler(args);
      case 'get_position_health':
        return getPositionHealthHandler(args);
      case 'get_wallet_balances':
        return getWalletBalancesHandler(args);
      default:
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        };
    }
  });

  return server;
}

export async function startStdioServer(deps: McpServerDeps): Promise<void> {
  const server = createMcpServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
