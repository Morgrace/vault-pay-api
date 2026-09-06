import { UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WebhookEventsRepository } from '../repositories/webhook-events.repository';
import { TListWebhookEvents } from '../validation/webhook-events-validation.schema';
import { WebhookEventsService } from './webhook-events.service';

type MockRepo = jest.Mocked<Pick<WebhookEventsRepository, 'findAll'>>;

describe('WebhookEventsService', () => {
  let service: WebhookEventsService;
  const repo: MockRepo = {
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WebhookEventsService,
        { provide: WebhookEventsRepository, useValue: repo },
      ],
    }).compile();

    service = module.get(WebhookEventsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('throws UnprocessableEntityException when an invalid dto is passed', async () => {
      const dto: TListWebhookEvents = {
        processed: 'true' as unknown as boolean,
        limit: 1000,
        page: 1,
      };

      await expect(service.findAll(dto)).rejects.toThrow(
        UnprocessableEntityException,
      );

      expect(repo.findAll).not.toHaveBeenCalled();
    });
  });
});
