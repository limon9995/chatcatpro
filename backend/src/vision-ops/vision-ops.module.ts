import { Module } from '@nestjs/common';
import { VisionAnalysisModule } from '../vision-analysis/vision-analysis.module';
import { ProductMatchModule } from '../product-match/product-match.module';
import { VisionOpsService } from './vision-ops.service';

@Module({
  imports: [VisionAnalysisModule, ProductMatchModule],
  providers: [VisionOpsService],
  exports: [VisionOpsService],
})
export class VisionOpsModule {}
