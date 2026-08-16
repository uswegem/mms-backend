import { Global, Module } from '@nestjs/common';
import { VaultAuthProvider } from './vault-auth.provider';
import { VaultTransitClient } from './vault-transit.client';

@Global()
@Module({
  providers: [VaultAuthProvider, VaultTransitClient],
  exports: [VaultAuthProvider, VaultTransitClient],
})
export class VaultModule {}
