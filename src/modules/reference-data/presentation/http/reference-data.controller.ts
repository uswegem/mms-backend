import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReferenceDataService } from '../../application/services/reference-data.service';

/**
 * Read-only lookup data (regions/districts/wards, banks) consumed by
 * onboarding and merchant-profile forms across every role. Deliberately has
 * no @RequirePermissions on any route — JwtAuthGuard still requires a valid
 * session, but there's no reason to gate a location dropdown behind a
 * specific permission when every role that can reach these forms needs it.
 */
@ApiTags('Reference Data')
@ApiBearerAuth('access-token')
@Controller('reference-data')
export class ReferenceDataController {
  constructor(private readonly referenceData: ReferenceDataService) {}

  @Get('regions')
  @ApiOperation({ summary: 'List all Tanzania regions' })
  listRegions() {
    return this.referenceData.listRegions();
  }

  @Get('regions/:region/districts')
  @ApiOperation({ summary: 'List districts within a region' })
  listDistricts(@Param('region') region: string) {
    return this.referenceData.listDistricts(region);
  }

  @Get('regions/:region/districts/:district/wards')
  @ApiOperation({
    summary: 'List wards within a district, each with its postcode',
  })
  listWards(
    @Param('region') region: string,
    @Param('district') district: string,
  ) {
    return this.referenceData.listWards(region, district);
  }

  @Get('banks')
  @ApiOperation({ summary: 'List Tanzania banks with SWIFT/BIC codes' })
  listBanks() {
    return this.referenceData.listBanks();
  }
}
