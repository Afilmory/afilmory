import type { PipeTransform } from '@tsuki/framework'
import { BadRequestException } from '@tsuki/framework'
import { injectable } from 'tsyringe'

@injectable()
export class ParseIntPipe implements PipeTransform<unknown, number> {
  transform(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isNaN(parsed)) {
        return parsed
      }
    }

    throw new BadRequestException('Validation failed (numeric string expected)')
  }
}
