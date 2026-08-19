import { ECurrency } from 'src/shared/types';

export interface IArticleResponse {
  id: string;
  title: string;
  content: string;
  coverImageUrl: string | null;
  isFree: boolean;
  price: number | null;
  currency: ECurrency | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface IArticlePreview extends IArticleResponse {
  requiresPurchase: true;
}
