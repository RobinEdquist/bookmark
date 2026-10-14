import { ApiProperty } from '@nestjs/swagger';
import {
  requestStages,
  requestIssues,
  transferStates,
  type RequestActivity,
} from '../request-activity';
import type { TransferState } from '../../tracker/transfer-observation';

export class RequestActivityDto implements RequestActivity {
  @ApiProperty({
    enum: requestStages,
    description:
      'Presentation stage, separate from approval status. ready requires confirmed library content.',
  })
  stage!: RequestActivity['stage'];
  @ApiProperty({ type: String, enum: transferStates, nullable: true })
  transferState!: TransferState | null;
  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: 1,
    nullable: true,
    description:
      'Observed download fraction, null when unknown. Never infers library readiness.',
  })
  progress!: number | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  observedAt!: string | null;
  @ApiProperty({
    description:
      'Last observation is retained while source lookup retries, or is older than ninety seconds.',
  })
  stale!: boolean;
  @ApiProperty({
    type: String,
    enum: requestIssues,
    nullable: true,
    description:
      'Safe explanation code; detailed source and import errors are admin-only.',
  })
  issue!: RequestActivity['issue'];
}

export class RequestDiagnosticsDto {
  @ApiProperty({ type: RequestActivityDto }) activity!: RequestActivityDto;
  @ApiProperty({ type: String, nullable: true }) rawState!: string | null;
  @ApiProperty({ type: String, nullable: true }) submissionReason!:
    string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  importErrorId!: string | null;
  @ApiProperty({ type: String, nullable: true }) importPath!: string | null;
  @ApiProperty({ type: String, nullable: true }) importMessage!: string | null;
  @ApiProperty({ type: String, nullable: true }) importStatus!: string | null;
  @ApiProperty({ type: Boolean }) canReconcile!: boolean;
}
