import { Test, TestingModule } from '@nestjs/testing';
import { TransactionRepository } from '../repositories/transactions.repositories';
import { TransactionsService } from './transactions.service';
import {
  TCreateTransactionsDto,
  TUpdateTransactionDto,
} from '../validation/transactions-validation.schema';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrdersService } from 'src/modules/orders/services/orders.service';
import { uuidv7 } from 'uuidv7';

type MockRepo = jest.Mocked<
  Pick<TransactionRepository, 'create' | 'find' | 'findById' | 'update'>
>;
type MockOrdersService = jest.Mocked<Pick<OrdersService, 'findById'>>;
type OrdersRecord = Awaited<ReturnType<OrdersService['findById']>>;
type TransactionsRecord = Awaited<ReturnType<TransactionsService['create']>>;

const orderMockValues: OrdersRecord = {
  id: 'some string',
  email: 'some string',
  userId: 'some string',
  articleId: 'some string',
  planId: 'some string',
  amount: 4300,
  currency: 'NGN',
  status: 'pending',
  valueDelivered: false,
  deliveredAt: new Date(),
  refundedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};
const transactionMockValues: TransactionsRecord = {
  amount: 5000,
  createdAt: new Date(),
  currency: 'NGN',
  failureReason: null,
  gatewayProvider: null,
  gatewayReference: null,
  gatewayResponse: null,
  id: 'some id',
  metadata: null,
  orderId: 'some id',
  status: 'pending',
  updatedAt: new Date(),
};

describe('TransactionService', () => {
  let service: TransactionsService;
  let repo: MockRepo;

  const ordersService: MockOrdersService = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: TransactionRepository, useValue: repo },
        { provide: OrdersService, useValue: ordersService },
      ],
    }).compile();
    service = module.get(TransactionsService);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTransaction', () => {
    it('throws UnprocessableEntityException on invalid dto', async () => {
      const dto: TCreateTransactionsDto = {
        amount: 5000,
        currency: 'NGN',
        orderId: 'vkdkajdj',
      };

      const result = service.create(dto);
      await expect(result).rejects.toThrow(UnprocessableEntityException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('creates transaction record on valid dto', async () => {
      const orderId = uuidv7();
      const dto: TCreateTransactionsDto = {
        amount: 5000,
        currency: 'NGN',
        orderId,
      };

      ordersService.findById.mockResolvedValue({
        ...orderMockValues,
        id: orderId,
      });
      repo.create.mockResolvedValue({ ...transactionMockValues, ...dto });

      const result = await service.create(dto);

      expect(result).toMatchObject(dto);
    });

    it('updateStatus throws UnprocessableEntityException when status is not valid', async () => {
      const dto = { status: 'in_valid' as 'pending' | 'success' | 'failed' };

      await expect(service.updateStatus('some_id', dto)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('update throw UnprocessableEntityException when dto is invalid', async () => {
      const dto: TUpdateTransactionDto = {
        // failureReason: 'some reason',
        gatewayProvider: 'paystack',
        gatewayReference: 'some_reference',
        gatewayResponse: { id: 'some_stuff' },
        status: 'failed',
      };
      await expect(service.update('some_id', dto)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('update to throw ConflictException when existing gateway reference is passed', async () => {
      const dto: TUpdateTransactionDto = {
        gatewayProvider: 'paystack',
        gatewayReference: 'some_reference',
      };
      repo.findById.mockResolvedValue({ ...transactionMockValues, ...dto });

      await expect(service.update('some_id', dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
