import { SetMetadata } from '@nestjs/common';

// Mark a route as open (no login needed), e.g. the WordPress webhook.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
