import { Global, Module } from '@nestjs/common';
import { IdentityModule } from '@modules/identity/identity.module';
import { PaymentEventsPublisher } from './payment-events.port';
import { PaymentsGateway } from './payments.gateway';

@Global()
@Module({
  imports: [IdentityModule],
  providers: [{ provide: PaymentEventsPublisher, useClass: PaymentsGateway }],
  exports: [PaymentEventsPublisher],
})
export class RealtimeModule {}
