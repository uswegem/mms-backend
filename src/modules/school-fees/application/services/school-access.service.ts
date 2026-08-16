import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma/prisma.service';
import { MerchantScopeService } from '@modules/merchants/application/services/merchant-scope.service';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

@Injectable()
export class SchoolAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: MerchantScopeService,
  ) {}

  async assertSchoolMerchant(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant?.isSchool) throw new BadRequestException('Merchant is not a school');
    if (merchant.status !== 'ACTIVE') throw new BadRequestException('School merchant must be ACTIVE');
    return merchant;
  }

  async assertActorCanAccessSchool(actor: ActorContext, merchantId: string) {
    const merchant = await this.assertSchoolMerchant(merchantId);
    this.scope.assertCanAccessMerchant(actor, merchant);
    return merchant;
  }
}
