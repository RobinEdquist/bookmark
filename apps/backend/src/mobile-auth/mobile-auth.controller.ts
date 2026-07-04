import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import {
  AllowAnonymous,
  OptionalAuth,
  AuthService,
} from '@thallesp/nestjs-better-auth';
import type { Request, Response } from 'express';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { OidcConfigService } from '../auth/oidc-config.service';
import { MobileAuthService } from './mobile-auth.service';
import {
  MobileAuthStartDto,
  MobileAuthCompleteDto,
} from './dto/mobile-auth-query.dto';
import type { AuthenticatedUser } from '../common/guards/auth.guard';

// Hardcoded literal — only query values (always URLSearchParams-encoded) vary,
// so this can never become an open redirect.
const APP_CALLBACK_BASE = 'bookmark://setup';

// /complete only honors sessions minted moments ago by the OAuth callback.
// Blocks drive-by top-level navigations riding an existing web session.
const SESSION_MAX_AGE_MS = 5 * 60_000;

const DEFAULT_KEY_NAME = 'Bookmark iOS - SSO';

interface SessionRequest extends Request {
  session?: {
    user?: AuthenticatedUser;
    session?: { createdAt: string | Date };
  } | null;
}

/**
 * Browser-driven OIDC sign-in for native apps.
 *
 * The app opens /start in an in-app browser (ASWebAuthenticationSession with
 * callback scheme `bookmark`). /start initiates Better Auth's OAuth flow
 * SERVER-SIDE so the signed state cookie lands in that same browser session
 * (an app-initiated POST would keep the cookie in the app's HTTP stack and
 * the OAuth callback would fail with state_mismatch). After the IdP round
 * trip, Better Auth redirects the browser to /complete, which converts the
 * fresh session into a bkmrk_ API key and hands it to the app via a
 * bookmark:// redirect that the browser sheet intercepts.
 */
@ApiExcludeController()
@Controller('mobile-auth')
export class MobileAuthController {
  private readonly logger = new Logger(MobileAuthController.name);

  constructor(
    private readonly mobileAuthService: MobileAuthService,
    private readonly apiKeysService: ApiKeysService,
    private readonly authService: AuthService,
    private readonly oidcConfigService: OidcConfigService,
    private readonly configService: ConfigService,
  ) {}

  @Get('start')
  @AllowAnonymous()
  async start(@Query() query: MobileAuthStartDto, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');

    if (!this.oidcConfigService.isOidcEnabled()) {
      return this.redirectToApp(res, {
        state: query.state,
        error: 'sso_disabled',
      });
    }

    const completeQuery = new URLSearchParams({ state: query.state });
    if (query.name?.trim()) {
      completeQuery.set('name', query.name.trim());
    }

    try {
      // signInWithOAuth2 comes from the genericOAuth plugin; the AuthService
      // generic doesn't carry plugin-inferred typings, hence the cast.
      const api = this.authService.api as unknown as {
        signInWithOAuth2: (input: {
          body: Record<string, unknown>;
          returnHeaders: true;
        }) => Promise<{ headers: Headers; response: { url: string } }>;
      };
      const { headers, response } = await api.signInWithOAuth2({
        body: {
          providerId: 'oidc',
          callbackURL: `/api/mobile-auth/complete?${completeQuery.toString()}`,
          errorCallbackURL: `/api/mobile-auth/complete?state=${encodeURIComponent(query.state)}`,
          disableRedirect: true,
        },
        returnHeaders: true,
      });

      // Forward the signed better-auth.state cookie into the browser session
      // that will complete the flow.
      for (const cookie of headers.getSetCookie()) {
        res.append('Set-Cookie', cookie);
      }
      return res.redirect(302, response.url);
    } catch (error) {
      this.logger.error(`Failed to start mobile OIDC flow: ${error}`);
      return this.redirectToApp(res, {
        state: query.state,
        error: 'server_error',
      });
    }
  }

  @Get('complete')
  @OptionalAuth()
  async complete(
    @Query() query: MobileAuthCompleteDto,
    @Req() req: SessionRequest,
    @Res() res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');

    if (query.error) {
      return this.redirectToApp(res, {
        state: query.state,
        error: query.error,
      });
    }

    // Cookie session only — deliberately ignore apiTokenUser so a leaked
    // ?token= API key can't mint further keys through this browser path.
    const user = req.session?.user;
    if (!user) {
      return this.redirectToApp(res, {
        state: query.state,
        error: 'unauthenticated',
      });
    }

    const createdAt = req.session?.session?.createdAt;
    const sessionAge = createdAt
      ? Date.now() - new Date(createdAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (sessionAge > SESSION_MAX_AGE_MS) {
      return this.redirectToApp(res, {
        state: query.state,
        error: 'stale_session',
      });
    }

    if (!(await this.mobileAuthService.canGenerateApiKeys(user))) {
      return this.redirectToApp(res, {
        state: query.state,
        error: 'not_permitted',
      });
    }

    try {
      const created = await this.apiKeysService.createApiKey(
        user.id,
        this.authService.instance,
        query.name?.trim() || DEFAULT_KEY_NAME,
      );
      return this.redirectToApp(res, {
        state: query.state,
        key: created.key,
        server: this.configService.get<string>(
          'BETTER_AUTH_URL',
          'http://localhost:3001',
        ),
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        return this.redirectToApp(res, {
          state: query.state,
          error: 'key_limit',
        });
      }
      this.logger.error(`Failed to mint mobile API key: ${error}`);
      return this.redirectToApp(res, {
        state: query.state,
        error: 'server_error',
      });
    }
  }

  private redirectToApp(res: Response, params: Record<string, string>) {
    const query = new URLSearchParams(params);
    return res.redirect(302, `${APP_CALLBACK_BASE}?${query.toString()}`);
  }
}
