import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Documentation only: the MCP SDK reads and writes these messages itself, so
 * no Nest pipe validates the body and no service returns this class.
 */
export class JsonRpcMessageDto {
  @ApiProperty({ example: '2.0' })
  jsonrpc!: '2.0';

  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { type: 'number' }],
    example: 1,
    description: 'Absent on notifications',
  })
  id?: string | number | null;

  @ApiPropertyOptional({ example: 'tools/call' })
  method?: string;

  @ApiPropertyOptional({ type: Object })
  params?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  result?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  error?: { code: number; message: string };
}
