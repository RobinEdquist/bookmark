import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { McpServerFactory } from './mcp-server.factory';
import { JsonRpcMessageDto } from './dto/json-rpc.dto';

interface McpRequest extends Request {
  apiTokenUser?: AuthenticatedUser;
}

/**
 * MCP over Streamable HTTP, stateless: every POST carries one JSON-RPC
 * message (or batch) and gets its answer as JSON in the same response. There
 * are no sessions, so GET (a server-to-client stream) and DELETE (ending a
 * session) are refused with 405, as the transport spec allows.
 *
 * Auth is the global middleware and guard. On top of that this endpoint takes
 * only an API key, not a browser session: an agent connects with a key, and
 * a cookie must not let a page in the browser drive it.
 */
@ApiTags('MCP')
@ApiSecurity('api-key')
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly factory: McpServerFactory) {}

  @Post()
  @ApiOperation({
    summary: 'MCP endpoint (Streamable HTTP, stateless)',
    description:
      'JSON-RPC messages for the Model Context Protocol. Connect an MCP ' +
      'client with a `bkmrk_` API key as `Authorization: Bearer`. Tools run ' +
      'as the key’s user and only read.',
  })
  @ApiBody({ type: JsonRpcMessageDto })
  @ApiResponse({
    status: 200,
    description: 'The JSON-RPC response',
    type: JsonRpcMessageDto,
  })
  @ApiResponse({ status: 202, description: 'A notification was accepted' })
  @ApiResponse({ status: 401, description: 'No valid API key' })
  async handle(@Req() req: McpRequest, @Res() res: Response): Promise<void> {
    const user = req.apiTokenUser;
    if (!user) {
      throw new UnauthorizedException('The MCP endpoint needs an API key');
    }

    const server = this.factory.create(user);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      this.logger.error('MCP request failed', error);
      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  }

  @Get()
  @ApiOperation({ summary: 'Not supported: the MCP endpoint is stateless' })
  @ApiResponse({ status: 405, description: 'Method not allowed' })
  stream(@Res() res: Response): void {
    methodNotAllowed(res);
  }

  @Delete()
  @ApiOperation({ summary: 'Not supported: the MCP endpoint has no sessions' })
  @ApiResponse({ status: 405, description: 'Method not allowed' })
  endSession(@Res() res: Response): void {
    methodNotAllowed(res);
  }
}

function methodNotAllowed(res: Response): void {
  res
    .status(HttpStatus.METHOD_NOT_ALLOWED)
    .set('Allow', 'POST')
    .json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
}
