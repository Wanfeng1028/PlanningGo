import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthService } from './authService.js'
import type { UserRepository } from '../repositories/userRepository.js'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import type { TokenService } from './tokenService.js'

// Mock crypto
vi.mock('../common/crypto.js', () => ({
  hashPassword: vi.fn(async (p: string) => 'hashed-' + p),
  comparePassword: vi.fn(async (plain: string, hash: string) => hash === 'hashed-' + plain),
}))

function mockUserRepo(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(async (data) => ({
      id: 'user-new',
      email: data.email,
      displayName: data.displayName ?? 'test',
      role: data.role ?? 'user',
      mode: data.mode ?? 'registered',
      status: 'active',
      passwordHash: data.passwordHash ?? null,
    })),
    update: vi.fn(),
    updatePasswordHash: vi.fn(async () => {}),
    softDelete: vi.fn(),
    createRefreshToken: vi.fn(),
    findRefreshToken: vi.fn(),
    revokeRefreshToken: vi.fn(),
    revokeAllRefreshTokens: vi.fn(),
    cleanExpiredTokens: vi.fn(),
    ...overrides,
  } as unknown as UserRepository
}

function mockProfileRepo(): ProfileRepository {
  return {
    findByUserId: vi.fn(),
    upsert: vi.fn(async () => ({})),
    getPermissions: vi.fn(),
    upsertPermissions: vi.fn(async () => ({})),
    getFullProfile: vi.fn(),
  } as unknown as ProfileRepository
}

function mockTokenService(): TokenService {
  return {
    issueTokenPair: vi.fn(async () => ({
      accessToken: 'access-123',
      refreshToken: 'refresh-123',
    })),
    refreshTokens: vi.fn(),
    revokeRefreshToken: vi.fn(),
    revokeAllTokens: vi.fn(async () => {}),
  } as unknown as TokenService
}

describe('AuthService', () => {
  let userRepo: UserRepository
  let profileRepo: ProfileRepository
  let tokenService: TokenService
  let authService: AuthService

  beforeEach(() => {
    userRepo = mockUserRepo()
    profileRepo = mockProfileRepo()
    tokenService = mockTokenService()
    authService = new AuthService(userRepo, profileRepo, tokenService)
    vi.clearAllMocks()
  })

  describe('register', () => {
    it('should register a new user and return tokens', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue(null)
      const result = await authService.register('new@example.com', 'password123', 'New User')
      expect(result.user.email).toBe('new@example.com')
      expect(result.user.displayName).toBe('New User')
      expect(result.accessToken).toBe('access-123')
      expect(result.refreshToken).toBe('refresh-123')
    })

    it('should create profile and permissions', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue(null)
      await authService.register('new@example.com', 'password123')
      expect(profileRepo.upsert).toHaveBeenCalledWith('user-new', expect.any(Object))
      expect(profileRepo.upsertPermissions).toHaveBeenCalledWith('user-new', expect.any(Object))
    })

    it('should throw if email already exists', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue({ id: 'existing' } as never)
      await expect(authService.register('taken@example.com', 'password123'))
        .rejects.toThrow('该邮箱已被注册')
    })

    it('should throw if password too short', async () => {
      await expect(authService.register('a@b.com', '123'))
        .rejects.toThrow('密码至少6位')
    })

    it('should throw if email or password empty', async () => {
      await expect(authService.register('', 'password123'))
        .rejects.toThrow('邮箱和密码不能为空')
      await expect(authService.register('a@b.com', ''))
        .rejects.toThrow('邮箱和密码不能为空')
    })

    it('should derive displayName from email if not provided', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue(null)
      const result = await authService.register('alice@example.com', 'password123')
      expect(result.user.displayName).toBe('alice')
    })
  })

  describe('login', () => {
    it('should login with correct credentials', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test',
        role: 'user',
        status: 'active',
        passwordHash: 'hashed-password123',
      } as never)

      const result = await authService.login('test@example.com', 'password123')
      expect(result.user.email).toBe('test@example.com')
      expect(result.accessToken).toBe('access-123')
    })

    it('should throw on wrong password', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        status: 'active',
        passwordHash: 'hashed-correct',
      } as never)

      await expect(authService.login('test@example.com', 'wrong'))
        .rejects.toThrow('邮箱或密码错误')
    })

    it('should throw on non-existent user', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue(null)
      await expect(authService.login('nobody@example.com', 'password123'))
        .rejects.toThrow('邮箱或密码错误')
    })

    it('should throw on disabled user', async () => {
      vi.mocked(userRepo.findByEmail).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        status: 'disabled',
        passwordHash: 'hashed-password123',
      } as never)

      await expect(authService.login('test@example.com', 'password123'))
        .rejects.toThrow('账号已被禁用')
    })

    it('should throw if email or password empty', async () => {
      await expect(authService.login('', 'pass')).rejects.toThrow('邮箱和密码不能为空')
      await expect(authService.login('a@b.com', '')).rejects.toThrow('邮箱和密码不能为空')
    })
  })

  describe('guestLogin', () => {
    it('should create guest user with default profile', async () => {
      const result = await authService.guestLogin()
      expect(result.user.email).toMatch(/@planninggo\.local$/)
      expect(result.user.displayName).toBe('体验用户')
      expect(result.accessToken).toBe('access-123')
    })

    it('should use provided profile data', async () => {
      await authService.guestLogin(undefined, {
        city: '上海',
        startPoint: '公司',
        companions: 'friends',
        budgetMin: 100,
        budgetMax: 500,
      })
      expect(profileRepo.upsert).toHaveBeenCalledWith(
        'user-new',
        expect.objectContaining({
          city: '上海',
          startPoint: '公司',
          companions: 'friends',
          budgetMin: 100,
          budgetMax: 500,
        }),
      )
    })

    it('should use locationLabel as displayName if provided', async () => {
      const result = await authService.guestLogin(undefined, { locationLabel: '我的位置' })
      expect(result.user.displayName).toBe('我的位置')
    })
  })

  describe('changePassword', () => {
    it('should change password and revoke all tokens', async () => {
      vi.mocked(userRepo.findById).mockResolvedValue({
        id: 'user-1',
        passwordHash: 'hashed-oldpass',
      } as never)

      await authService.changePassword('user-1', 'oldpass', 'newnewnew')
      expect(userRepo.updatePasswordHash).toHaveBeenCalledWith('user-1', 'hashed-newnewnew')
      expect(tokenService.revokeAllTokens).toHaveBeenCalledWith('user-1')
    })

    it('should throw on wrong old password', async () => {
      vi.mocked(userRepo.findById).mockResolvedValue({
        id: 'user-1',
        passwordHash: 'hashed-correct',
      } as never)

      await expect(authService.changePassword('user-1', 'wrong', 'newnewnew'))
        .rejects.toThrow('旧密码错误')
    })

    it('should throw if user not found', async () => {
      vi.mocked(userRepo.findById).mockResolvedValue(null)
      await expect(authService.changePassword('nobody', 'old', 'newnewnew'))
        .rejects.toThrow('用户不存在')
    })

    it('should throw if new password too short', async () => {
      await expect(authService.changePassword('user-1', 'old', '123'))
        .rejects.toThrow('新密码至少6位')
    })

    it('should throw if user has no password (guest)', async () => {
      vi.mocked(userRepo.findById).mockResolvedValue({
        id: 'user-1',
        passwordHash: null,
      } as never)

      await expect(authService.changePassword('user-1', 'old', 'newnewnew'))
        .rejects.toThrow('当前账号未设置密码')
    })
  })
})