import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DbOrTx } from 'src/shared/database/base.repository';
import { ITransaction } from '../interface';
import { TransactionRepository } from '../repositories/transactions.repositories';
import {
  createTransactionsSchema,
  listTransactionsQuerySchema,
  TCreateTransactionsDto,
  TListTransactionQuery,
  transactionsBaseSchema,
  TUpdateTransactionDto,
  updateTransactionsSchema,
} from '../validation/transactions-validation.schema';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);
  constructor(private readonly transactionsRepo: TransactionRepository) {}
  async create(dto: TCreateTransactionsDto, tx?: DbOrTx) {
    const parsed = createTransactionsSchema.safeParse(dto);
    if (!parsed.success) {
      throw new UnprocessableEntityException(parsed.error, 'Validation failed');
    }

    return this.transactionsRepo.create(parsed.data, tx);
  }

  async find(query: TListTransactionQuery) {
    const parsed = listTransactionsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new UnprocessableEntityException(parsed.error, 'Validation failed');
    }
    return this.transactionsRepo.find(parsed.data);
  }

  async updateStatus(
    id: string,
    status: Pick<ITransaction, 'status'>,
    tx?: DbOrTx,
  ) {
    const parsed = transactionsBaseSchema
      .pick({ status: true })
      .safeParse(status);

    if (!parsed.success) {
      throw new UnprocessableEntityException(parsed.error, 'Validation failed');
    }

    return this.transactionsRepo.update(id, parsed.data, tx);
  }

  async update(id: string, dto: TUpdateTransactionDto, tx?: DbOrTx) {
    const parsed = await updateTransactionsSchema.safeParseAsync(dto);

    if (!parsed.success) {
      throw new UnprocessableEntityException(parsed.error, 'Validation failed');
    }
    const existingTransaction = await this.transactionsRepo.findById(id);

    if (!existingTransaction) {
      throw new NotFoundException(`transaction ${id} not found`);
    }
    const updateData = parsed.data;
    const { gatewayReference } = parsed.data;

    if (gatewayReference && existingTransaction.gatewayReference) {
      if (existingTransaction.gatewayReference === gatewayReference) {
        throw new ConflictException(
          `transaction ${id} already has a gateway reference, cannot overwrite (existing: ${existingTransaction.gatewayReference}, attempted: ${gatewayReference})`,
        );
      }
      updateData.gatewayReference = undefined;
      updateData.gatewayProvider = undefined;
    }

    return this.transactionsRepo.update(id, updateData, tx);
  }
}
