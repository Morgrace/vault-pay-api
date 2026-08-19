import { Module } from '@nestjs/common';
import { ArticleController } from './controllers/articles.controller';
import { ArticleRepository } from './repositories/articles.repository';
import { ArticlesService } from './services/articles.service';

@Module({
  controllers: [ArticleController],
  providers: [ArticleRepository, ArticlesService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
