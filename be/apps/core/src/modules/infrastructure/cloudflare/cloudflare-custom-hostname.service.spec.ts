import 'reflect-metadata'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CloudflareCustomHostnameService } from './cloudflare-custom-hostname.service'

vi.mock('@afilmory/env', () => ({
  env: {
    CLOUDFLARE_API_TOKEN: 'test-token',
    CLOUDFLARE_CUSTOM_HOSTNAME_TARGET: 'https://Customers.Afilmory.Art/',
    CLOUDFLARE_ZONE_ID: '0123456789abcdef0123456789abcdef',
  },
}))

function cloudflareResponse(result: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify({ success: true, errors: [], result }), {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

describe('cloudflareCustomHostnameService', () => {
  const fetchMock = vi.fn()
  let service: CloudflareCustomHostnameService

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    service = new CloudflareCustomHostnameService()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers a hostname for HTTP validation and returns the configured CNAME target', async () => {
    fetchMock.mockResolvedValueOnce(
      cloudflareResponse(
        {
          id: 'hostname-id',
          hostname: 'photos.example.com',
          status: 'pending',
          ssl: { method: 'http', status: 'pending_validation' },
        },
        { status: 201 },
      ),
    )

    const result = await service.create('photos.example.com')

    expect(service.getCnameTarget()).toBe('customers.afilmory.art')
    expect(result.id).toBe('hostname-id')
    expect(fetchMock).toHaveBeenCalledOnce()

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/0123456789abcdef0123456789abcdef/custom_hostnames')
    expect(request.method).toBe('POST')
    expect(request.headers).toMatchObject({ authorization: 'Bearer test-token' })
    expect(JSON.parse(String(request.body))).toEqual({
      hostname: 'photos.example.com',
      ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } },
    })
  })

  it('retries domain validation with a complete domain-validation SSL payload', async () => {
    fetchMock.mockResolvedValueOnce(
      cloudflareResponse(
        {
          id: 'hostname-id',
          hostname: 'photos.example.com',
          status: 'active',
          ssl: { method: 'http', status: 'active' },
        },
        { status: 202 },
      ),
    )

    await service.retryValidation('hostname-id')

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/zones/0123456789abcdef0123456789abcdef/custom_hostnames/hostname-id',
    )
    expect(request.method).toBe('PATCH')
    expect(JSON.parse(String(request.body))).toEqual({
      ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } },
    })
  })

  it('recovers an existing Cloudflare hostname after an idempotent create conflict', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 1406, message: 'The custom hostname already exists.' }],
          }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        cloudflareResponse([
          {
            id: 'existing-hostname-id',
            hostname: 'photos.example.com',
            status: 'active',
            ssl: { method: 'http', status: 'active' },
          },
        ]),
      )

    const result = await service.createOrGet('photos.example.com')

    expect(result.id).toBe('existing-hostname-id')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/custom_hostnames?hostname=photos.example.com')
  })

  it('surfaces Cloudflare validation errors without treating the request as successful', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 1417, message: 'Zone does not have a fallback origin set.' }],
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    )

    await expect(service.create('photos.example.com')).rejects.toThrow('Zone does not have a fallback origin set.')
  })

  it('treats an already deleted hostname as a successful idempotent deletion', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 1436, message: 'The custom hostname was not found.' }],
        }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      ),
    )

    await expect(service.delete('missing-hostname-id')).resolves.toBeUndefined()

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/custom_hostnames/missing-hostname-id')
    expect(request.method).toBe('DELETE')
  })
})
