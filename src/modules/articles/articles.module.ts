import { Module } from '@nestjs/common';
import { ArticleController } from './controllers/articles.controller';
import { ArticleRepository } from './repositories/articles.repository';
import { ArticlesMailService } from './services/articles-mail.service';
import { ArticlesService } from './services/articles.service';

@Module({
  controllers: [ArticleController],
  providers: [ArticleRepository, ArticlesService, ArticlesMailService],
  exports: [ArticlesService, ArticlesMailService],
})
export class ArticlesModule {}
