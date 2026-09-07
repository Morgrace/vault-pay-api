import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { type ISessionData } from '../auth.interface';
import { AuthService } from '../services/auth.service';
import { appConfig } from 'src/config';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('google')
  async googleAuth(@Res() res: Response) {
    const url = await this.authService.getAuthorizationUrl('google');
    res.redirect(url);
  }

  @Public()
  @Get('github')
  async githubAuth(@Res() res: Response) {
    const url = await this.authService.getAuthorizationUrl('github');
    res.redirect(url);
  }

  @Public()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const { sessionToken } = await this.authService.handleCallback(
      'google',
      code,
      state,
    );
    this.setCookie(res, sessionToken);
    res.redirect(this.getRedirectUrl());
  }

  @Public()
  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const { sessionToken } = await this.authService.handleCallback(
      'github',
      code,
      state,
    );
    this.setCookie(res, sessionToken);
    res.redirect(this.getRedirectUrl());
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.vaultpay_session as string | undefined;
    if (token) {
      await this.authService.logout(token);
    }
    res.clearCookie('vaultpay_session');
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  me(@CurrentUser() user: ISessionData) {
    return { user };
  }

  private setCookie(res: Response, token: string): void {
    res.cookie('vaultpay_session', token, {
      httpOnly: true,
      secure: appConfig.app.env === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
  }

  private getRedirectUrl(): string {
    return appConfig.app.authRedirectUrl ?? 'http://localhost:5173';
  }
}
