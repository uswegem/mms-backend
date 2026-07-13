
import { INestApplication, ValidationPipe } from '@nestjs/common';
describe('Health (e2e)', () => {
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });