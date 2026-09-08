import { apnsDevices, authUsers, gallerySubscriptions, tenantMemberships, tenants } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { and, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import type { RegisterPushDeviceDto } from './push-device.dto'

export type APNsEnvironment = 'development' | 'production'

export interface DeliverableAPNsDevice {
  id: string
  deviceToken: string
  environment: APNsEnvironment
  locale: string | null
}

@injectable()
export class PushDeviceService {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async register(userId: string, input: RegisterPushDeviceDto): Promise<{ id: string }> {
    const db = this.dbAccessor.get()
    const now = new Date().toISOString()
    const [device] = await db
      .insert(apnsDevices)
      .values({
        userId,
        deviceToken: input.token,
        environment: input.environment,
        locale: input.locale,
        appVersion: input.appVersion,
        enabled: true,
        lastSeenAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [apnsDevices.deviceToken, apnsDevices.environment],
        set: {
          userId,
          locale: input.locale,
          appVersion: input.appVersion,
          enabled: true,
          lastSeenAt: now,
          updatedAt: now,
        },
      })
      .returning({ id: apnsDevices.id })

    if (!device) {
      throw new Error('The APNs device registration did not return a device record.')
    }
    return device
  }

  async unregister(userId: string, token: string): Promise<void> {
    const db = this.dbAccessor.get()
    await db.delete(apnsDevices).where(and(eq(apnsDevices.userId, userId), eq(apnsDevices.deviceToken, token)))
  }

  async listGalleryRecipientDeviceIds(targetTenantId: string): Promise<{
    gallery: { avatarUrl?: string, name: string, slug: string } | null
    deviceIds: string[]
  }> {
    const db = this.dbAccessor.get()
    const rows = await db
      .select({
        deviceId: apnsDevices.id,
        galleryName: tenants.name,
        gallerySlug: tenants.slug,
        ownerImage: authUsers.image,
      })
      .from(gallerySubscriptions)
      .innerJoin(
        apnsDevices,
        and(eq(apnsDevices.userId, gallerySubscriptions.subscriberUserId), eq(apnsDevices.enabled, true)),
      )
      .innerJoin(tenants, eq(tenants.id, gallerySubscriptions.targetTenantId))
      .leftJoin(
        tenantMemberships,
        and(
          eq(tenantMemberships.tenantId, tenants.id),
          eq(tenantMemberships.role, 'owner'),
          eq(tenantMemberships.status, 'active'),
        ),
      )
      .leftJoin(authUsers, eq(authUsers.id, tenantMemberships.userId))
      .where(
        and(
          eq(gallerySubscriptions.targetTenantId, targetTenantId),
          eq(tenants.status, 'active'),
          eq(tenants.banned, false),
        ),
      )

    const first = rows[0]
    const avatarUrl = first?.ownerImage?.trim() || undefined
    return {
      gallery: first
        ? {
            ...(avatarUrl ? { avatarUrl } : {}),
            name: first.galleryName,
            slug: first.gallerySlug,
          }
        : null,
      deviceIds: rows.map(row => row.deviceId),
    }
  }

  async findDeliverableDevice(deviceId: string, targetTenantId: string): Promise<DeliverableAPNsDevice | null> {
    const db = this.dbAccessor.get()
    const [device] = await db
      .select({
        id: apnsDevices.id,
        deviceToken: apnsDevices.deviceToken,
        environment: apnsDevices.environment,
        locale: apnsDevices.locale,
      })
      .from(apnsDevices)
      .innerJoin(
        gallerySubscriptions,
        and(
          eq(gallerySubscriptions.subscriberUserId, apnsDevices.userId),
          eq(gallerySubscriptions.targetTenantId, targetTenantId),
        ),
      )
      .where(and(eq(apnsDevices.id, deviceId), eq(apnsDevices.enabled, true)))
      .limit(1)

    return device ?? null
  }

  async updateEnvironment(deviceId: string, environment: APNsEnvironment): Promise<void> {
    const db = this.dbAccessor.get()
    await db
      .update(apnsDevices)
      .set({ environment, updatedAt: new Date().toISOString() })
      .where(eq(apnsDevices.id, deviceId))
  }

  async disable(deviceId: string): Promise<void> {
    const db = this.dbAccessor.get()
    await db
      .update(apnsDevices)
      .set({ enabled: false, updatedAt: new Date().toISOString() })
      .where(eq(apnsDevices.id, deviceId))
  }
}
