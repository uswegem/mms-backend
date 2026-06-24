import { DocumentType } from '@prisma/client';
import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class AddKycDocumentCommand {
  constructor(
    public readonly actor: ActorContext,
    public readonly merchantId: string,
    public readonly docType: DocumentType,
    public readonly fileName: string,
    public readonly s3Bucket: string,
    public readonly s3Key: string,
    public readonly mimeType?: string,
    public readonly fileSize?: number,
  ) {}
}
