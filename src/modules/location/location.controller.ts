import { Controller, Get, Query } from '@nestjs/common';
import { LocationService } from './location.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('locations')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Public()
  @Get('provinces')
  provinces() {
    return this.locationService.getProvinces();
  }

  @Public()
  @Get('cities')
  cities(@Query('provinceId') provinceId?: string) {
    return this.locationService.getCities(provinceId);
  }
}
