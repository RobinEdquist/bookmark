import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { TtsService } from './tts.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import {
  CreateTtsJobDto,
  UpdateTtsConfigDto,
  ValidateTtsConnectionDto,
} from './dto/tts.dto';

@ApiTags('TTS')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('tts')
@UseGuards(RolesGuard)
@Roles('admin')
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get TTS integration status',
    description:
      'Returns whether AI audiobook generation is enabled and configured, plus the active voice settings. The API key is never returned.',
  })
  @ApiResponse({ status: 200, description: 'Integration status' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getStatus() {
    return this.ttsService.getStatus();
  }

  @Post('config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update TTS configuration',
    description:
      'Update the TTS server URL, API key, voice, speed, model, or enabled flag.',
  })
  @ApiResponse({ status: 200, description: 'Updated status' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async updateConfig(@Body() dto: UpdateTtsConfigDto) {
    return this.ttsService.updateConfig(dto);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Test a TTS server connection',
    description:
      'Checks that the given server is reachable and can synthesize speech. Does not persist anything.',
  })
  @ApiResponse({ status: 200, description: 'Connection test result' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async validate(@Body() dto: ValidateTtsConnectionDto) {
    return this.ttsService.validateConnection(dto);
  }

  @Get('voices')
  @ApiOperation({
    summary: 'List voices from the configured TTS server',
    description:
      'Returns { voices: null } when the server has no voice-listing endpoint.',
  })
  @ApiResponse({ status: 200, description: 'Available voices' })
  @ApiResponse({ status: 412, description: 'TTS server not configured' })
  async getVoices() {
    const voices = await this.ttsService.getVoices();
    return { voices };
  }

  @Post('jobs')
  @ApiOperation({
    summary: 'Queue audiobook generation for an ebook',
    description:
      'Creates a background job that narrates the ebook into an audiobook in the library.',
  })
  @ApiResponse({ status: 201, description: 'Job created' })
  @ApiResponse({ status: 404, description: 'Ebook not found' })
  @ApiResponse({
    status: 409,
    description: 'Job already active or audiobook already generated',
  })
  @ApiResponse({ status: 412, description: 'TTS not enabled/configured' })
  async createJob(
    @Body() dto: CreateTtsJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ttsService.createJob(dto.ebookId, user.id, dto.voice);
  }

  @Get('jobs')
  @ApiOperation({
    summary: 'List recent generation jobs',
    description: 'Returns the 50 most recent TTS generation jobs.',
  })
  @ApiResponse({ status: 200, description: 'Recent jobs' })
  async listJobs() {
    return this.ttsService.listJobs();
  }

  @Post('jobs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a generation job',
    description:
      'Pending jobs are cancelled immediately; running jobs stop at the next chunk boundary.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Job cancelled or cancelling' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async cancelJob(@Param('id', ParseUUIDPipe) id: string) {
    return this.ttsService.cancelJob(id);
  }

  @Post('jobs/:id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retry a failed generation job',
    description:
      'Re-queues a failed job. Already-generated chapters are reused.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Job re-queued' })
  @ApiResponse({ status: 400, description: 'Job is not in a failed state' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async retryJob(@Param('id', ParseUUIDPipe) id: string) {
    return this.ttsService.retryJob(id);
  }

  @Delete('jobs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Dismiss a finished generation job',
    description:
      'Removes a completed, failed, or cancelled job from the list and deletes its temporary files.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Job dismissed' })
  @ApiResponse({ status: 400, description: 'Job is still in progress' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async dismissJob(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.ttsService.dismissJob(id);
  }
}
