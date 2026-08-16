import { Injectable } from '@nestjs/common';
import type { ReconExceptionApprovalPort } from '@modules/maker-checker/application/ports/recon-exception-approval.port';
import { ExceptionResolutionService } from './exception-resolution.service';

@Injectable()
export class ReconExceptionApprovalAdapter implements ReconExceptionApprovalPort {
  constructor(private readonly resolution: ExceptionResolutionService) {}

  onCheckerApproved(caseId: string, checkerId: string, notes?: string) {
    return this.resolution.onApprovalDecision(caseId, checkerId, true, notes).then(() => undefined);
  }

  onCheckerRejected(caseId: string, checkerId: string, notes?: string) {
    return this.resolution.onApprovalDecision(caseId, checkerId, false, notes).then(() => undefined);
  }
}
