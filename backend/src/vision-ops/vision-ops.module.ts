import { Module } from '@nestjs/common';
import { VisionAnalysisModule } from '../vision-analysis/vision-analysis.module';
import { VisionOpsService } from './vision-ops.service';

@Module({
  imports: [VisionAnalysisModule],
  providers: [VisionOpsService],
  exports: [VisionOpsService],
})
export class VisionOpsModule {}
