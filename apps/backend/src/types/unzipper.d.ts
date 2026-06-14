// The published @types/unzipper (0.10.x) is older than the installed unzipper
// runtime (0.12.x) and is missing the `tailSize` option on Open.file(). That
// option controls how many trailing bytes are scanned for the ZIP
// End-Of-Central-Directory record; we need a larger window to read comic
// archives that carry a long ZIP comment (see comic-archive.utils.ts).
import 'unzipper';

declare module 'unzipper' {
  namespace Open {
    function file(
      filename: string,
      options?: { tailSize?: number },
    ): Promise<CentralDirectory>;
  }
}
