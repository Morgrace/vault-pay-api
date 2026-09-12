import { Test, TestingModule } from '@nestjs/testing';
import { MailerModule } from '@nestjs-modules/mailer';
import { ArticlesMailService } from './articles-mail.service';
import { appConfig } from 'src/config';
import { articles, orders } from 'src/database/schema';

const TEST_EMAIL = 'morgrace.dev@gmail.com';

const testArticle: typeof articles.$inferSelect = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Understanding Payment Gateway Integration',
  content:
    'Payment gateway integration is a crucial aspect of modern e-commerce applications. In this comprehensive guide, we explore the various methods and best practices for integrating payment gateways into your NestJS application. We cover topics such as handling webhooks, managing transaction states, implementing idempotency keys, and ensuring secure communication with payment providers like Paystack and Stripe.',
  coverImageUrl: 'https://example.com/images/payment-guide.jpg',
  isFree: false,
  price: 5000,
  currency: 'NGN',
  publishedAt: new Date(),
  createdBy: '550e8400-e29b-41d4-a716-446655440001',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const testOrder: typeof orders.$inferSelect = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  email: TEST_EMAIL,
  userId: '550e8400-e29b-41d4-a716-446655440003',
  articleId: testArticle.id,
  planId: null,
  amount: 5000,
  currency: 'NGN',
  status: 'success',
  valueDelivered: true,
  deliveredAt: new Date(),
  refundedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testRefundedOrder: typeof orders.$inferSelect = {
  ...testOrder,
  id: '550e8400-e29b-41d4-a716-446655440004',
  status: 'refunded',
  refundedAt: new Date(),
};

describe('ArticlesMailService (integration - real SMTP)', () => {
  let service: ArticlesMailService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        MailerModule.forRoot(appConfig.mailer),
      ],
      providers: [ArticlesMailService],
    }).compile();

    service = module.get<ArticlesMailService>(ArticlesMailService);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('sendArticlePurchaseEmail', () => {
    it('sends a purchase confirmation email', async () => {
      const result = await service.sendArticlePurchaseEmail(
        TEST_EMAIL,
        testArticle,
        testOrder,
        `https://vaultpay.com/articles/${testArticle.id}`,
      );

      expect(result).toBe(true);
    }, 30000);
  });

  describe('sendArticleRefundEmail', () => {
    it('sends a refund notification email', async () => {
      const result = await service.sendArticleRefundEmail(
        TEST_EMAIL,
        testArticle,
        testRefundedOrder,
      );

      expect(result).toBe(true);
    }, 30000);
  });
});
