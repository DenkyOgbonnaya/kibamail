import { Secret } from "@poppinss/utils"
import type { Next } from "hono"

import { AccessTokenRepository } from "@/auth/acess_tokens/repositories/access_token_repository.js"
import { UserRepository } from "@/auth/users/repositories/user_repository.ts"

import type { HonoContext } from "@/server/types.js"

import { E_UNAUTHORIZED } from "@/http/responses/errors.js"

import { container } from "@/utils/typi.js"

export class AccessTokenMiddleware {
  constructor(
    private accessTokenRepository = container.make(AccessTokenRepository),
    private userRepository = container.make(UserRepository),
  ) {}

  handle = async (ctx: HonoContext, next: Next) => {
    const tokenHeader = ctx.req
      .header("authorization")
      ?.split("Bearer ")?.[1]

    if (!tokenHeader) {
      throw E_UNAUTHORIZED()
    }

    const accessToken = await this.accessTokenRepository.verifyToken(
      new Secret(tokenHeader),
    )

    if (!accessToken) {
      throw E_UNAUTHORIZED()
    }

    const user = await this.userRepository.findById(
      accessToken.accessToken.userId,
    )

    if (!user) {
      throw E_UNAUTHORIZED()
    }

    ctx.set("accessToken", accessToken.accessToken)
    ctx.set("user", user)

    await next()
  }
}
