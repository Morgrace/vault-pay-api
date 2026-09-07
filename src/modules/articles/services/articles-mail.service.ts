import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { articles } from 'src/database/schema';

@Injectable()
export class ArticlesMailService {
  private logger = new Logger(ArticlesMailService.name);
  constructor(private readonly mailerService: MailerService) {}
  async sendArticleEmail(email: string, article: typeof articles.$inferSelect) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'something_about_purchased_article',
        template: 'some_template',
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send article ${article.id} to ${email}`,
        error,
      );
      return false;
    }
  }
}
