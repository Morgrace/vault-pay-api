import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from 'src/common/decorators/public.decorator';
import { WebhooksService } from '../services/webhooks.service';
import { PaymentsService } from 'src/modules/payments/services/payments.service';
import { paystackWebhookSchema } from 'src/modules/payments/validation/paystack-validation.schema';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Public()
  @Post('paystack')
  @HttpCode(HttpStatus.OK)
  async handlePaystackWebhook(@Req() req: Request, @Res() res: Response) {
    // 1. Check signature header
    const signature = req.headers['x-paystack-signature'] as string | undefined;
    if (!signature) {
      this.logger.warn('Paystack webhook missing signature header');
      return res.status(400).json({ message: 'Missing signature' });
    }

    // 2. Check raw body is available
    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error(
        'Raw body not available — check rawBody config in main.ts',
      );
      return res.status(500).json({ message: 'Raw body not configured' });
    }

    // 3. Verify HMAC signature
    const isValid = this.paymentsService.verifyWebhookSignature(
      rawBody,
      signature,
    );
    if (!isValid) {
      this.logger.warn('Invalid Paystack webhook signature');
      return res.status(403).json({ message: 'Invalid signature' });
    }

    // 4. Validate payload shape (narrow — only fields we read)
    const parsed = paystackWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      this.logger.warn('Malformed Paystack webhook payload', parsed.error);
      return res.status(400).json({ message: 'Malformed payload' });
    }

    const { event, data } = parsed.data;
    const reference = data.reference ?? String(data.id ?? '');

    if (!reference) {
      this.logger.warn('Webhook payload missing reference and id');
      return res.status(400).json({ message: 'Missing reference' });
    }

    // 5. Ingest into DB (idempotent via unique constraint on event_type + reference)
    try {
      await this.webhooksService.ingest(event, reference, parsed.data);
    } catch (err) {
      this.logger.error('Failed to persist webhook event', err);
      return res.status(500).json({ message: 'Failed to record event' });
    }

    // 6. Return 200 immediately — processing happens async via poller
    return res.status(200).json({ message: 'OK' });
  }
}
