import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CatalogController } from './catalog.controller';

@Module({ imports: [PrismaModule], controllers: [CatalogController] })
export class CatalogModule {}
