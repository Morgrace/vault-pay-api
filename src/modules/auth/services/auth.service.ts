import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import axios from 'axios';
import { RedisService } from 'src/shared/redis/redis.service';
import { UsersService } from '../../users/services/users.service';
import {
  IOAuthUserInfo,
  ISessionData,
  TOAuthProviders,
} from '../auth.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly usersService: UsersService,
  ) {}

  async getAuthorizationUrl(provider: TOAuthProviders): Promise<string> {
    const state = randomBytes(32).toString('hex');

    await this.redisService.client.set(
      `oauth_state:${state}`,
      provider,
      'EX',
      600,
    );

    const { clientId, redirectUri } = this.getProviderConfig(provider);

    if (provider === 'google') {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'email profile');
      url.searchParams.set('state', state);
      return url.toString();
    }

    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'user:email');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async handleCallback(
    provider: TOAuthProviders,
    code: string,
    state: string,
  ): Promise<{ sessionToken: string; user: any }> {
    const storedProvider = await this.redisService.client.get(
      `oauth_state:${state}`,
    );

    if (!storedProvider || storedProvider !== provider) {
      throw new BadRequestException('Invalid or expired state parameter');
    }

    await this.redisService.client.del(`oauth_state:${state}`);

    const { access_token } = await this.exchangeCodeForTokens(provider, code);
    const userInfo = await this.fetchUserInfo(provider, access_token);

    const user = await this.usersService.findOrCreate({
      email: userInfo.email,
      fullName: userInfo.name,
      avatarUrl: userInfo.avatarUrl,
      provider,
      providerId: userInfo.providerId,
    });

    const sessionToken = randomBytes(48).toString('hex');
    const sessionData: ISessionData = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    await this.redisService.client.set(
      `session:${sessionToken}`,
      JSON.stringify(sessionData),
      'EX',
      60 * 60 * 24 * 7,
    );

    this.logger.log(`User authenticated: ${user.id} via ${provider}`);

    return { sessionToken, user };
  }

  async logout(sessionToken: string): Promise<void> {
    await this.redisService.client.del(`session:${sessionToken}`);
  }

  async validateSession(sessionToken: string): Promise<ISessionData | null> {
    const raw = await this.redisService.client.get(`session:${sessionToken}`);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as ISessionData;
    } catch {
      await this.redisService.client.del(`session:${sessionToken}`);
      return null;
    }
  }

  private getProviderConfig(provider: TOAuthProviders) {
    return {
      clientId: this.configService.get<string>(`oauth.${provider}.clientID`)!,
      clientSecret: this.configService.get<string>(
        `oauth.${provider}.clientSecret`,
      )!,
      redirectUri: this.configService.get<string>(
        `oauth.${provider}.callbackURL`,
      )!,
    };
  }

  private async exchangeCodeForTokens(
    provider: TOAuthProviders,
    code: string,
  ): Promise<{ access_token: string }> {
    const { clientId, clientSecret, redirectUri } =
      this.getProviderConfig(provider);

    try {
      if (provider === 'google') {
        const { data } = await axios.post(
          'https://oauth2.googleapis.com/token',
          {
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          },
        );
        return { access_token: data.access_token };
      }

      const { data } = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        },
        { headers: { Accept: 'application/json' } },
      );
      return { access_token: data.access_token };
    } catch (error) {
      this.logger.error('OAuth token exchange failed', error);
      throw new InternalServerErrorException('Failed to exchange OAuth code');
    }
  }

  private async fetchUserInfo(
    provider: TOAuthProviders,
    accessToken: string,
  ): Promise<IOAuthUserInfo> {
    try {
      if (provider === 'google') {
        const { data } = await axios.get(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        return {
          email: data.email,
          name: data.name,
          avatarUrl: data.picture,
          providerId: data.id,
        };
      }

      const { data: userData } = await axios.get(
        'https://api.github.com/user',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      let email: string = userData.email;

      if (!email) {
        const { data: emails } = await axios.get(
          'https://api.github.com/user/emails',
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const primary = emails.find((e: any) => e.primary && e.verified);
        if (!primary?.email) {
          throw new BadRequestException(
            'No verified email found on GitHub account',
          );
        }
        email = primary.email;
      }

      return {
        email,
        name: userData.name || userData.login,
        avatarUrl: userData.avatar_url,
        providerId: String(userData.id),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Failed to fetch OAuth user info', error);
      throw new InternalServerErrorException('Failed to fetch user info');
    }
  }
}
