import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TokenService } from './tokenService.js'
import type { UserRepository } from '../repositories/userRepository.js'

// Mock crypto module
vi.mock('../common/crypto.js', () => ({
  signAccessToken: vi.fn(() => 'mock-access-token'),
  signRefreshToken: vi.fn(() => 'mock-refresh-token'),
  verifyRefreshToken: vi.fn(() => ({ sub: 'user-1', jti: 'jti-1' })),
}))

// Mock env
vi.mock('../config/env.js', () => ({
  env: {
    JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-chars-long',
    JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-chars-long',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    BCRYPT_ROUNDS: 10,
  },
}))

function mockUserRepo(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updatePasswordHash: vi.fn(),
    softDelete: vi.fn(),
    createRefreshToken: vi.fn(async () => ({ id: 'rt-1' })),
    findRefreshToken: vi.fn(),
    revokeRefreshToken: vi.fn(async () => {}),
    revokeAllRefreshTokens: vi.fn(async () => ({ count: 1 })),
    cleanExpiredTokens: vi.fn(async () => ({ count: 0 })),
    ...overrides,
  } as unknown as UserRepository
}

describe('TokenService', () => {
  let userRepo: UserRepository
  let service: TokenService

  beforeEach(() => {
    userRepo = mockUserRepo()
    service = new TokenService(userRepo)
    vi.clearAllMocks()
  })

  describe('issueTokenPair', () => {
    it('should return accessToken and refreshToken', async () => {
      const result = await service.issueTokenPair('user-1', 'test@example.com', 'user')
      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      })
    })

    it('should store refresh token hash in DB', async () => {
      await service.issueTokenPair('user-1', 'test@example.com', 'user', {
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
      })
      expect(userRepo.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
          userAgent: 'test-agent',
          ipAddress: '127.0.0.1',
        }),
      )
    })

    it('should generate SHA-256 hash of refresh token', async () => {
      const crypto = await import('node:crypto')
      const expectedHash = crypto.createHash('sha256').update('mock-refresh-token').digest('hex')
      await service.issueTokenPair('user-1', 'a@test.com', 'user')
      const call = (userRepo.createRefreshToken as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(call.tokenHash).toBe(expectedHash)
    })

    it('should pass meta info to createRefreshToken', async () => {
      await service.issueTokenPair('user-1', 'a@test.com', 'user', {
        userAgent: 'Mozilla/5.0',
        ipAddress: '10.0.0.1',
      })
      expect(userRepo.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: 'Mozilla/5.0',
          ipAddress: '10.0.0.1',
        }),
      )
    })
  })

  describe('refreshTokens', () => {
    it('should revoke old token and issue new pair', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', role: 'user', status: 'active' }
      vi.mocked(userRepo.findRefreshToken).mockResolvedValue({ id: 'rt-1' } as never)
      vi.mocked(userRepo.findById).mockResolvedValue(mockUser as never)

      const result = await service.refreshTokens('old-refresh-token')
      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      })
      expect(userRepo.revokeRefreshToken).toHaveBeenCalledWith('rt-1')
    })

    it('should return null if refresh token not found in DB', async () => {
      vi.mocked(userRepo.findRefreshToken).mockResolvedValue(null)
      const result = await service.refreshTokens('invalid-token')
      expect(result).toBeNull()
    })

    it('should return null if user not found', async () => {
      vi.mocked(userRepo.findRefreshToken).mockResolvedValue({ id: 'rt-1' } as never)
      vi.mocked(userRepo.findById).mockResolvedValue(null)
      const result = await service.refreshTokens('old-token')
      expect(result).toBeNull()
    })

    it('should return null if user is disabled', async () => {
      vi.mocked(userRepo.findRefreshToken).mockResolvedValue({ id: 'rt-1' } as never)
      vi.mocked(userRepo.findById).mockResolvedValue({ id: 'user-1', status: 'disabled' } as never)
      const result = await service.refreshTokens('old-token')
      expect(result).toBeNull()
    })

    it('should return null if verifyRefreshToken throws', async () => {
      const { verifyRefreshToken } = await import('../common/crypto.js')
      vi.mocked(verifyRefreshToken).mockImplementationOnce(() => { throw new Error('invalid') })
      const result = await service.refreshTokens('bad-token')
      expect(result).toBeNull()
    })
  })

  describe('revokeRefreshToken', () => {
    it('should revoke token by hash', async () => {
      vi.mocked(userRepo.findRefreshToken).mockResolvedValue({ id: 'rt-1' } as never)
      await service.revokeRefreshToken('some-token')
      expect(userRepo.revokeRefreshToken).toHaveBeenCalledWith('rt-1')
    })

    it('should do nothing if token not found', async () => {
      vi.mocked(userRepo.findRefreshToken).mockResolvedValue(null)
      await service.revokeRefreshToken('nonexistent')
      expect(userRepo.revokeRefreshToken).not.toHaveBeenCalled()
    })
  })

  describe('revokeAllTokens', () => {
    it('should revoke all tokens for user', async () => {
      await service.revokeAllTokens('user-1')
      expect(userRepo.revokeAllRefreshTokens).toHaveBeenCalledWith('user-1')
    })
  })
})