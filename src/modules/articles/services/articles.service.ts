import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ISessionData } from 'src/modules/auth/auth.interface';
import { ArticleRepository } from '../repositories/articles.repository';
import {
  TCreateArticleDto,
  TListArticleQuery,
  TUpdateArticleDto,
} from '../validation/article-validation.schema';

@Injectable()
export class ArticlesService {
  private readonly logger = new Logger(ArticlesService.name);
  constructor(private readonly articlesRepo: ArticleRepository) {}

  async create(data: TCreateArticleDto, session: ISessionData) {
    const createdArticle = await this.articlesRepo.create({
      ...data,
      createdBy: session.userId,
    });

    this.logger.log(
      `Creating article: ${createdArticle.title} || by user ${session.userId}`,
    );

    return createdArticle;
  }

  async findById(id: string) {
    return this.articlesRepo.findById(id);
  }

  async findAll(opts?: TListArticleQuery) {
    return this.articlesRepo.findAll(opts);
  }

  async update(id: string, data: TUpdateArticleDto, currentUser: ISessionData) {
    const articleToUpdate = await this.articlesRepo.findById(id);

    if (!articleToUpdate) {
      throw new NotFoundException('Could not find article');
    }

    if (articleToUpdate.createdBy !== currentUser.userId) {
      throw new ForbiddenException('Can only update articles created by you');
    }

    this.logger.log(`Updating article ${id} to ${JSON.stringify(data)}`);

    return this.articlesRepo.update(id, data);
  }

  async publish(id: string, currentUser: ISessionData) {
    const articleToPublish = await this.articlesRepo.findById(id);
    if (!articleToPublish) {
      throw new NotFoundException('Article not found');
    }

    if (articleToPublish.createdBy !== currentUser.userId) {
      throw new ForbiddenException(
        'You are not allowed to publish this article',
      );
    }

    this.logger.log(`Publishing article ${id}`);

    return this.articlesRepo.publish(id);
  }

  async remove(id: string, currentUser: ISessionData) {
    const articleToDelete = await this.articlesRepo.findById(id);
    if (!articleToDelete) {
      throw new NotFoundException('Article not found');
    }

    const isCreator = articleToDelete.createdBy === currentUser.userId;

    if (!isCreator) {
      throw new ForbiddenException('You can only delete articles you created');
    }

    this.logger.log(`Soft-deleting article ${id}`);

    return this.articlesRepo.remove(id);
  }
}
