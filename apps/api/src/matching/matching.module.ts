import { Module } from '@nestjs/common';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { JobAnalysisService } from './job-analysis.service';
import { MatchWeightsService } from './match-weights.service';
import { MatchWeightsController } from './match-weights.controller';
import { ReliabilityModule } from '../reliability/reliability.module';

@Module({
  imports: [ReliabilityModule],
  controllers: [MatchingController, MatchWeightsController],
  providers: [MatchingService, JobAnalysisService, MatchWeightsService],
  exports: [MatchingService],
})
export class MatchingModule {}
