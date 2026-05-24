export interface IOAuthUserInfo {
  email: string;
  name: string;
  avatarUrl: string;
  providerId: string;
}

export type TOAuthProviders = 'google' | 'github';

export interface ISessionData {
  userId: string;
  email: string;
  role: string;
}
