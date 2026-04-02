import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { CatalogController } from './catalog.controller';

@Module({ imports: [PrismaModule, ProductsModule], controllers: [CatalogController] })
export class CatalogModule {}
