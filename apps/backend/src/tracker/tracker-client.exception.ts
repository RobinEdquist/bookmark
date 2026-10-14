import { HttpException } from '@nestjs/common';

/** Public responses stay generic; this detail is for admin attempt history. */
export class TrackerClientException extends HttpException {
  constructor(
    statusText: string,
    status: number,
    readonly sourceDetail: string,
  ) {
    super(`Tracker client error: ${statusText}`, status);
  }
}
