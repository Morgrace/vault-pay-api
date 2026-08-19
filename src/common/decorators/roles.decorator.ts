import { SetMetadata } from '@nestjs/common';
import { userRoleEnum } from 'src/shared/database/schema';

export const ROLES_KEY = 'roles';
export const Role = userRoleEnum.enumValues.reduce(
  (acc, value) => ({ ...acc, [value.toUpperCase()]: value }),
  {} as Record<Uppercase<RoleType>, RoleType>,
);
export type RoleType = (typeof userRoleEnum.enumValues)[number];

export const Roles = (...roles: RoleType[]) => SetMetadata(ROLES_KEY, roles);
