import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Role, Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { type ISessionData } from 'src/modules/auth/auth.interface';
import { ArticlesService } from '../services/articles.service';
import {
  createArticleSchema,
  listArticleQuerySchema,
  updateArticleSchema,
  type TCreateArticleDto,
  type TListArticleQuery,
  type TUpdateArticleDto,
} from '../validation/article-validation.schema';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('articles')
export class ArticleController {
  constructor(private readonly articleService: ArticlesService) {}
  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(
    @Query(new ZodValidationPipe(listArticleQuerySchema))
    query: TListArticleQuery,
  ) {
    return this.articleService.findAll(query);
  }

  @Public()
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.articleService.findById(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(createArticleSchema)) body: TCreateArticleDto,
    @CurrentUser() user: ISessionData,
  ) {
    return this.articleService.create(body, user);
  }

  @Patch('/publish/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ISessionData,
  ) {
    return this.articleService.publish(id, user);
  }
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateArticleSchema)) body: TUpdateArticleDto,
    @CurrentUser() user: ISessionData,
  ) {
    return this.articleService.update(id, body, user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ISessionData,
  ) {
    await this.articleService.remove(id, user);
    return {
      message: 'Article deleted successfully',
    };
  }
}
