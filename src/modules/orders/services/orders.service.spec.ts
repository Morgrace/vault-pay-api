import { ArticlesService } from 'src/modules/articles/services/articles.service';
import { AuditLogsService } from 'src/modules/audit-logs/services/audit-logs.service';
import { OrdersRepository } from '../repositories/orders.repository';
import { Test } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { TCreateOrdersDto } from '../validation/orders-validation.schema';
import { uuidv7 } from 'uuidv7';
import { UnprocessableEntityException } from '@nestjs/common';

type MockAuditLogsService = jest.Mocked<Pick<AuditLogsService, 'append'>>;
type MockArticlesService = jest.Mocked<Pick<ArticlesService, 'findById'>>;
type MockRepo = jest.Mocked<
  Pick<OrdersRepository, 'create' | 'findAll' | 'findById' | 'update'>
>;
describe('OrdersService', () => {
  let service: OrdersService;
  const repo: MockRepo = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
  };
  const auditLogsService: MockAuditLogsService = {
    append: jest.fn(),
  };
  const articlesService: MockArticlesService = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: OrdersRepository, useValue: repo },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ArticlesService, useValue: articlesService },
      ],
    }).compile();
    service = module.get(OrdersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    it('throws UnprocessableEntityException when an invalid dto is passed', async () => {
      const dto: TCreateOrdersDto = {
        amount: 5000,
        currency: 'NGN',
        email: 'some_email',
        articleId: 'this_will_fail',
        planId: uuidv7(),
      };
      await expect(service.create(dto)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('updateOrderStatus', () => {
    it('throw UnprocessableEntityException when an invalid status is passed', async () => {
      const dto = 'invalid_status' as
        | 'pending'
        | 'success'
        | 'failed'
        | 'refunded';

      await expect(service.updateStatus('some_id', dto)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
