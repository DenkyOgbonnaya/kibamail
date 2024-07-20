import { eq } from "drizzle-orm"
import { container, inject, injectable } from "tsyringe"

import { TeamPolicy } from "@/domains/audiences/policies/team_policy.js"
import { BaseController } from "@/domains/shared/controllers/base_controller.ts"
import { InstallMailerAction } from "@/domains/teams/actions/install_mailer_action.js"
import { CreateMailerAction } from "@/domains/teams/actions/mailers/create_mailer_action.js"
import { GetMailerAction } from "@/domains/teams/actions/mailers/get_mailer_action.js"
import { UpdateMailerAction } from "@/domains/teams/actions/mailers/update_mailer_action.js"
import { CreateMailerSchema } from "@/domains/teams/dto/mailers/create_mailer_dto.js"
import { UpdateMailerSchema } from "@/domains/teams/dto/mailers/update_mailer_dto.js"
import { MailerRepository } from "@/domains/teams/repositories/mailer_repository.js"
import {
  E_OPERATION_FAILED,
  E_UNAUTHORIZED,
  E_VALIDATION_FAILED,
} from "@/http/responses/errors.js"
import { ContainerKey } from "@/infrastructure/container.js"
import { mailers } from "@/infrastructure/database/schema/schema.ts"
import { HonoInstance } from "@/infrastructure/server/hono.ts"
import { HonoContext } from "@/infrastructure/server/types.ts"

@injectable()
export class MailerController extends BaseController {
  constructor(
    @inject(MailerRepository) protected mailerRepository: MailerRepository,
    @inject(ContainerKey.app) protected app: HonoInstance,
  ) {
    super()
    this.app.defineRoutes(
      [
        ["POST", "/", this.store.bind(this)],
        ["GET", "/", this.index.bind(this)],
        ["PATCH", "/:mailerId", this.update.bind(this)],
        ["PATCH", "/:mailerId/reconnect", this.reconnect.bind(this)],
        ["POST", "/:mailerId/install", this.install.bind(this)],
      ],
      {
        prefix: "mailers",
      },
    )
  }

  async index(ctx: HonoContext) {
    await this.ensureHasPermissions(ctx)

    const action = container.resolve(GetMailerAction)

    const mailer = await action.handle(ctx.get("team"))

    return mailer
  }

  async store(ctx: HonoContext) {
    const data = await this.validate(ctx, CreateMailerSchema)

    await this.ensureHasPermissions(ctx)

    const action = container.resolve<CreateMailerAction>(CreateMailerAction)

    const mailer = await action.handle(data, ctx.get("team"))

    return ctx.json(mailer)
  }

  async update(ctx: HonoContext) {
    const data = await this.validate(ctx, UpdateMailerSchema)

    const mailer = await this.ensureMailerExists(ctx)

    await this.ensureHasPermissions(ctx)

    const action = container.resolve<UpdateMailerAction>(UpdateMailerAction)

    await action.handle(mailer, data, ctx.get("team"))

    return ctx.json({ id: mailer.id })
  }

  async install(ctx: HonoContext) {
    const mailer = await this.ensureMailerExists(ctx)

    await this.ensureHasPermissions(ctx)

    const action = container.resolve<InstallMailerAction>(InstallMailerAction)

    const success = await action.handle(mailer, ctx.get("team"))

    if (!success) throw E_OPERATION_FAILED("Failed to install mailer.")

    return ctx.json({ id: mailer.id })
  }

  async reconnect(ctx: HonoContext) {
    const mailer = await this.ensureMailerExists(ctx)

    await this.ensureHasPermissions(ctx)

    const configuration = this.mailerRepository.getDecryptedConfiguration(
      mailer.configuration,
      ctx.get("team").configurationKey,
    )

    const data = await this.validate(ctx, UpdateMailerSchema)

    if (data?.configuration.region !== configuration.region) {
      throw E_VALIDATION_FAILED({
        errors: [
          {
            message:
              "Cannot update region when reconnecting. To change the region of your mailer, please create a new mailer instead.",
            path: ["configuration"],
          },
        ],
      })
    }

    await container
      .resolve<UpdateMailerAction>(UpdateMailerAction)
      .reconnecting()
      .handle(mailer, data, ctx.get("team"))

    const updatedMailer = await this.mailerRepository.findById(mailer.id)

    await container
      .resolve<InstallMailerAction>(InstallMailerAction)
      .handle(updatedMailer!, ctx.get("team"))

    return ctx.json({ id: mailer.id })
  }

  protected async ensureMailerExists(ctx: HonoContext) {
    const mailer = await this.mailerRepository.findById(
      ctx.req.param("mailerId"),
      [
        eq(mailers.teamId, ctx.get("team").id),
        eq(mailers.id, ctx.req.param("mailerId")),
      ],
    )

    if (!mailer)
      throw E_VALIDATION_FAILED({
        errors: [{ message: "Unknown mailer.", path: ["mailerId"] }],
      })

    return mailer
  }

  protected async ensureHasPermissions(ctx: HonoContext) {
    const policy = container.resolve<TeamPolicy>(TeamPolicy)

    if (
      !policy.canAdministrate(ctx.get("team"), ctx.get("accessToken").userId!)
    )
      throw E_UNAUTHORIZED()
  }
}
