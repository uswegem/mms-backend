import { Module } from '@nestjs/common';
import { PosterRenderer } from './poster.renderer';

@Module({
  providers: [PosterRenderer],
  exports: [PosterRenderer],
})
export class QrPosterModule {}
