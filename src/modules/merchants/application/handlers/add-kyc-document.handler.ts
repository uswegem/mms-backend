import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AddKycDocumentCommand } from '../commands/add-kyc-document.command';
import { MerchantsRepository } from '../../infrastructure/persistence/merchants.repository';
import { MerchantScopeService } from '../services/merchant-scope.service';
import { AuditLogService } from '@infrastructure/audit/services/audit-log.service';
import { Permission } from '@infrastructure/auth/rbac/enums/permission.enum';
import { MerchantNotFoundException } from '../../domain/exceptions/merchant.exceptions';

@CommandHandler(AddKycDocumentCommand)
export class AddKycDocumentHandler
  implements ICommandHandler<AddKycDocumentCommand>
{
  constructor(
    private readonly merchants: MerchantsRepository,
    private readonly scope: MerchantScopeService,
    private readonly audit: AuditLogService,
  ) {}

  async execute(command: AddKycDocumentCommand) {
    this.scope.requirePermission(command.actor, Permission.MERCHANT_KYC_WRITE);

    const existing = await this.merchants.findById(command.merchantId);
    if (!existing) throw new MerchantNotFoundException(command.merchantId);
    this.scope.assertCanAccessMerchant(command.actor, existing);

    const doc = await this.merchants.addDocument({
      merchantId: command.merchantId,
      docType: command.docType,
      fileName: command.fileName,
      s3Bucket: command.s3Bucket,
      s3Key: command.s3Key,
      mimeType: command.mimeType,
      fileSize: command.fileSize ? BigInt(command.fileSize) : undefined,
      createdBy: command.actor.sub,
    });

    await this.audit.record({
      actorId: command.actor.sub,
      action: 'MERCHANT_KYC_DOCUMENT_ADDED',
      entityType: 'merchant_document',
      entityId: doc.id,
      metadata: { merchantId: command.merchantId, docType: command.docType },
    });

    return {
      id: doc.id,
      docType: doc.docType,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize?.toString() ?? null,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}
