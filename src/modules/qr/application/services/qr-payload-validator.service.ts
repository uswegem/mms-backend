import { Injectable } from '@nestjs/common';
import { buildTanqrPayload, TanqrPayloadInput } from '../../domain/tanqr-payload.builder';
import {
  TanqrFieldValidationInput,
  validateTanqrFieldInput,
  verifyTanqrPayload,
} from '../../domain/tanqr-payload.validator';

export interface ValidateQrPayloadDto {
  tlv_payload?: string;
  poi_method?: '11' | '12';
  acquirer_id5?: string;
  merchant_id?: string;
  mcc?: string;
  merchant_name?: string;
  city?: string;
  postal_code?: string;
  amount?: string;
  store_label?: string;
  terminal_label?: string;
  bill_number?: string;
  reference_label?: string;
}

@Injectable()
export class QrPayloadValidatorService {
  verifyExistingPayload(tlvPayload: string) {
    return verifyTanqrPayload(tlvPayload);
  }

  validateFields(input: TanqrFieldValidationInput) {
    return validateTanqrFieldInput(input);
  }

  buildAndVerify(input: TanqrPayloadInput) {
    validateTanqrFieldInput({
      poiMethod: input.poiMethod,
      acquirerId5: input.acquirerId5,
      merchantId: input.publicAlias,
      mcc: input.mcc,
      merchantName: input.merchantName,
      city: input.city,
      postalCode: input.postalCode,
      amount: input.amount,
      storeLabel: input.additionalData?.storeLabel,
      terminalLabel: input.additionalData?.terminalLabel,
      billNumber: input.additionalData?.billNumber,
      referenceLabel: input.additionalData?.referenceLabel,
    });

    const built = buildTanqrPayload(input);
    const verification = verifyTanqrPayload(built.tlvPayload);

    return {
      ...built,
      verification,
    };
  }

  validateRequest(dto: ValidateQrPayloadDto) {
    if (dto.tlv_payload) {
      return {
        mode: 'verify' as const,
        result: verifyTanqrPayload(dto.tlv_payload),
      };
    }

    if (!dto.poi_method || !dto.acquirer_id5 || !dto.merchant_id) {
      return {
        mode: 'error' as const,
        result: {
          valid: false,
          errors: [
            'Provide tlv_payload to verify, or all required fields to build and verify',
          ],
        },
      };
    }

    const built = this.buildAndVerify({
      poiMethod: dto.poi_method,
      acquirerId5: dto.acquirer_id5,
      publicAlias: dto.merchant_id,
      mcc: dto.mcc ?? '0000',
      merchantName: dto.merchant_name ?? '',
      city: dto.city ?? '',
      postalCode: dto.postal_code ?? '',
      amount: dto.amount,
      additionalData: {
        storeLabel: dto.store_label,
        terminalLabel: dto.terminal_label,
        billNumber: dto.bill_number,
        referenceLabel: dto.reference_label,
      },
    });

    return {
      mode: 'build' as const,
      tlv_payload: built.tlvPayload,
      crc: built.crcValue,
      result: built.verification,
    };
  }
}
