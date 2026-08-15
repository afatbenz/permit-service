import { Injectable } from '@nestjs/common';
// resolveJsonModule is enabled in tsconfig so this imports as a plain object.
import locationData from '../../config/location.json';

interface ProvinceRow {
  id: string;
  name: string;
}

interface CityRow {
  id: string;
  name: string;
  province: string;
  province_id: string;
  latitude?: number;
  longitude?: number;
}

interface LocationFile {
  cities: CityRow[];
  provinces: ProvinceRow[];
}

/**
 * Serves Indonesia's provinces/cities from the bundled location.json
 * (static reference data — no DB). Endpoints are @Public so the register
 * and onboarding forms can populate dropdowns pre-login.
 */
@Injectable()
export class LocationService {
  private readonly data = locationData as LocationFile;

  getProvinces() {
    // Dedupe by id; some names may carry trailing spaces in the source file.
    const seen = new Set<string>();
    const provinces = this.data.provinces
      .filter((p) => {
        if (seen.has(p.id)) {
          return false;
        }
        seen.add(p.id);
        return true;
      })
      .map((p) => ({ id: p.id, name: p.name.trim() }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { provinces };
  }

  getCities(provinceId?: string) {
    let cities = this.data.cities;
    if (provinceId) {
      cities = cities.filter((c) => c.province_id === provinceId);
    }
    return {
      cities: cities
        .map((c) => ({
          id: c.id,
          name: c.name.trim(),
          province: c.province?.trim() ?? null,
          provinceId: c.province_id,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
