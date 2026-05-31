import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthService } from './authService.js'
import type { UserRepository } from '../repositories/userRepository.js'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import type { TokenService } from './tokenService.js'

vi.mock('../common/crypto.js', () => ({
  hashPassword: vi.fn(async (p: string) => 'hashed-' + p),
  comparePassword: vi.fn(async (plain: string, hash: string) => hash === 'hashed-' + plain),
}))

function mockUserRepo(overrides = {}) {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(async (data) => ({ id: 'user-new', email: data.email, displayName: data.displayName ?? 'test', role: 'user', mode: 'registered', status: 'active', passwordHash: data.passwordHash ?? null })),
    update: vi.fn(),
    updatePasswordHash: vi.fn(async () => {}),
    softDelete: vi.fn(),
    createRefreshToken: vi.fn(),
    findRefreshToken: vi.fn(),
    revokeRefreshToken: vi.fn(),
    revokeAllRefreshTokens: vi.fn(),
    cleanExpiredTokens: vi.fn(),
    createPasswordResetToken: vi.fn(async () => {}),
    findPasswordResetToken: vi.fn(),
    usePasswordResetToken: vi.fn(async () => {}),
    ...overrides,
  }
}

function mockProfileRepo() {
  return { findByUserId: vi.fn(), upsert: vi.fn(async () => ({})), getPermissions: vi.fn(), upsertPermissions: vi.fn(async () => ({})), getFullProfile: vi.fn() }
}

function mockTokenService() {
  return { issueTokenPair: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })), refreshTokens: vi.fn(), revokeRefreshToken: vi.fn(), revokeAllTokens: vi.fn(async () => {}) }
}

describe('AuthService - Password Reset', () => {
  let userRepo: any
  let authService: AuthService

  beforeEach(() => {
    userRepo = mockUserRepo()
    authService = new AuthService(userRepo, mockProfileRepo() as any, mockTokenService() as any)
    vi.clearAllMocks()
  })

  describe('requestPasswordReset', () => {
    it('should return token for existing active user', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue({ id: 'user-1', status: 'active' } as never)
      const result = await authService.requestPasswordReset('test@example.com')
      expect(result).not.toBeNull()
      expect(result!.token).toHaveLength(64) // 32 bytes hex
      expect(result!.expiresAt).toBeInstanceOf(Date)
      expect(userRepo.createPasswordResetToken).toHaveBeenCalled()
    })

    it('should return null for non-existent user', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue(null)
      const result = await authService.requestPasswordReset('nobody@example.com')
      expect(result).toBeNull()
    })

    it('should return null for disabled user', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue({ id: 'user-1', status: 'disabled' } as never)
      const result = await authService.requestPasswordReset('test@example.com')
      expect(result).toBeNull()
    })

    it('should throw if email empty', async () => {
      await expect(authService.requestPasswordReset('')).rejects.toThrow('请提供邮箱')
    })
  })

  describe('resetPassword', () => {
    it('should reset password with valid token', async () => {
      vi.mocked(userRepo.findPasswordResetToken).mockResolvedValue({ id: 'rt-1', userId: 'user-1' } as never)
      await authService.resetPassword('valid-token', 'newpassword123')
      expect(userRepo.updatePasswordHash).toHaveBeenCalledWith('user-1', 'hashed-newpassword123')
      expect(userRepo.usePasswordResetToken).toHaveBeenCalledWith('rt-1')
    })

    it('should throw for invalid token', async () => {
      vi.mocked(userRepo.findPasswordResetToken).mockResolvedValue(null)
      await expect(authService.resetPassword('bad-token', 'newpassword123')).rejects.toThrow('重置令牌无效或已过期')
    })

    it('should throw for short password', async () => {
      await expect(authService.resetPassword('token', '123')).rejects.toThrow('新密码至少6位')
    })

    it('should throw if token or password empty', async () => {
      await expect(authService.resetPassword('', 'newpassword')).rejects.toThrow('请提供重置令牌和新密码')
      await expect(authService.resetPassword('token', '')).rejects.toThrow('请提供重置令牌和新密码')
    })
  })
})
