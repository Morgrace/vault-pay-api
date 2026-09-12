import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { articles, orders } from 'src/database/schema';

@Injectable()
export class ArticlesMailService {
  private readonly logger = new Logger(ArticlesMailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendArticlePurchaseEmail(
    email: string,
    article: typeof articles.$inferSelect,
    order: typeof orders.$inferSelect,
    articleUrl: string,
  ): Promise<boolean> {
    try {
      const amount = this.formatAmount(order.amount);
      const purchasedAt = this.formatDate(order.createdAt);
      const articlePreview = article.content.substring(0, 100).trim();

      await this.mailerService.sendMail({
        to: email,
        subject: `Purchase Confirmed: ${article.title}`,
        template: 'article-purchase',
        context: {
          userName: email.split('@')[0],
          articleTitle: article.title,
          articlePreview,
          articleUrl,
          amount,
          currency: order.currency,
          orderId: order.id,
          purchasedAt,
          year: new Date().getFullYear(),
        },
      });

      this.logger.log(
        `Purchase email sent for article ${article.id} to ${email}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send purchase email for article ${article.id} to ${email}`,
        error,
      );
      return false;
    }
  }

  async sendArticleRefundEmail(
    email: string,
    article: typeof articles.$inferSelect,
    order: typeof orders.$inferSelect,
  ): Promise<boolean> {
    try {
      const amount = this.formatAmount(order.amount);
      const refundedAt = order.refundedAt
        ? this.formatDate(order.refundedAt)
        : this.formatDate(new Date());

      await this.mailerService.sendMail({
        to: email,
        subject: `Refund Processed: ${article.title}`,
        template: 'article-refund',
        context: {
          userName: email.split('@')[0],
          articleTitle: article.title,
          amount,
          currency: order.currency,
          orderId: order.id,
          refundedAt,
          year: new Date().getFullYear(),
        },
      });

      this.logger.log(
        `Refund email sent for article ${article.id} to ${email}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send refund email for article ${article.id} to ${email}`,
        error,
      );
      return false;
    }
  }

  private formatAmount(amount: number): string {
    return (amount / 100).toFixed(2);
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-GB', { dateStyle: 'long' });
  }
}
