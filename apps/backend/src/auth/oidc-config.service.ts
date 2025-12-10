import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OidcConfig {
  enabled: boolean;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
}

@Injectable()
export class OidcConfigService {
  constructor(private configService: ConfigService) {}

  isOidcEnabled(): boolean {
    const enabled = this.configService.get<string>('OIDC_ENABLED');
    if (enabled !== 'true') {
      return false;
    }

    // Also check that required fields are present
    const issuerUrl = this.configService.get<string>('OIDC_ISSUER_URL');
    const clientId = this.configService.get<string>('OIDC_CLIENT_ID');
    const clientSecret = this.configService.get<string>('OIDC_CLIENT_SECRET');

    return !!(issuerUrl && clientId && clientSecret);
  }

  getOidcConfig(): OidcConfig | null {
    if (!this.isOidcEnabled()) {
      return null;
    }

    return {
      enabled: true,
      issuerUrl: this.configService.get<string>('OIDC_ISSUER_URL')!,
      clientId: this.configService.get<string>('OIDC_CLIENT_ID')!,
      clientSecret: this.configService.get<string>('OIDC_CLIENT_SECRET')!,
    };
  }

  getIssuerUrl(): string | null {
    if (!this.isOidcEnabled()) {
      return null;
    }
    return this.configService.get<string>('OIDC_ISSUER_URL') || null;
  }
}
