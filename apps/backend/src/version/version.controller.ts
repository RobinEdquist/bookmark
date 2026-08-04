import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { VersionService } from './version.service';
import { UpdateCheckService } from './update-check.service';
import { VersionResponseDto } from './dto/version-response.dto';

@ApiTags('Version')
@Controller('version')
export class VersionController {
  constructor(
    private readonly versionService: VersionService,
    private readonly updateCheckService: UpdateCheckService,
  ) {}

  // Deliberately NOT @AllowAnonymous, unlike /health: an exact version string
  // handed to an unauthenticated scanner is a free CVE lookup against an
  // internet-exposed instance. Everything that renders it is behind auth anyway.
  @Get()
  @ApiOperation({
    summary: 'Running version',
    description:
      'Returns the version, channel, and build provenance of the running image.',
  })
  @ApiResponse({
    status: 200,
    description: 'Version information',
    type: VersionResponseDto,
  })
  getVersion(): VersionResponseDto {
    return {
      ...this.versionService.getVersion(),
      update: this.updateCheckService.getUpdateInfo(),
    };
  }
}
