import { CreateBroadcastAction } from '@/domains/broadcasts/actions/create_broadcast_action.js'
import { DeleteBroadcastAction } from '@/domains/broadcasts/actions/delete_broadcast_action.js'
import { SendBroadcastAction } from '@/domains/broadcasts/actions/send_broadcast_action.ts'
import { UpdateBroadcastAction } from '@/domains/broadcasts/actions/update_broadcast_action.js'
import { CreateBroadcastDto } from '@/domains/broadcasts/dto/create_broadcast_dto.js'
import { SendBroadcastDto } from '@/domains/broadcasts/dto/send_broadcast_dto.ts'
import { UpdateBroadcastDto } from '@/domains/broadcasts/dto/update_broadcast_dto.js'
import { SendBroadcastJob } from '@/domains/broadcasts/jobs/send_broadcast_job.ts'
import { BaseController } from '@/domains/shared/controllers/base_controller.js'
import { BroadcastsQueue } from '@/domains/shared/queue/queue.ts'
import { BroadcastValidationAndAuthorizationConcern } from '@/http/api/concerns/broadcast_validation_concern.js'
import { E_VALIDATION_FAILED } from '@/http/responses/errors.ts'
import { makeApp } from '@/infrastructure/container.ts'
import { Broadcast } from '@/infrastructure/database/schema/types.ts'
import type { HonoInstance } from '@/infrastructure/server/hono.ts'
import type { HonoContext } from '@/infrastructure/server/types.js'
import { differenceInSeconds } from '@/utils/dates.ts'
import { container } from '@/utils/typi.js'
import { safeParseAsync } from 'valibot'

export class BroadcastController extends BaseController {
  constructor(
    private app: HonoInstance = makeApp(),
    private broadcastValidationAndAuthorizationConcern: BroadcastValidationAndAuthorizationConcern = container.make(
      BroadcastValidationAndAuthorizationConcern,
    ),
  ) {
    super()

    this.app.defineRoutes(
      [
        ['POST', '/', this.create.bind(this)],
        ['DELETE', '/:broadcastId', this.delete.bind(this)],
        ['PUT', '/:broadcastId', this.update.bind(this)],
        ['POST', '/:broadcastId/send', this.send.bind(this)],
      ],
      { prefix: 'broadcasts' },
    )
  }

  async create(ctx: HonoContext) {
    await this.broadcastValidationAndAuthorizationConcern.ensureHasPermissions(
      ctx,
    )

    const data = await this.validate(ctx, CreateBroadcastDto)
    const broadcast = await container
      .resolve(CreateBroadcastAction)
      .handle(data, ctx.get('team').id)

    return ctx.json(broadcast, 201)
  }

  async delete(ctx: HonoContext) {
    const broadcast =
      await this.broadcastValidationAndAuthorizationConcern.ensureBroadcastExists(
        ctx,
      )
    await this.broadcastValidationAndAuthorizationConcern.ensureHasPermissions(
      ctx,
      broadcast,
    )
    const id = ctx.req.param('broadcastId')

    await container.resolve(DeleteBroadcastAction).handle(id)

    return ctx.json({ id })
  }

  async update(ctx: HonoContext) {
    const broadcast =
      await this.broadcastValidationAndAuthorizationConcern.ensureBroadcastExists(
        ctx,
      )
    await this.broadcastValidationAndAuthorizationConcern.ensureHasPermissions(
      ctx,
      broadcast,
    )
    const broadcastId = ctx.req.param('broadcastId')

    const data = await this.validate(ctx, UpdateBroadcastDto)

    const { id } = await container
      .resolve(UpdateBroadcastAction)
      .handle(broadcastId, data)

    return ctx.json({ id })
  }

  async send(ctx: HonoContext) {
    const broadcast =
      await this.broadcastValidationAndAuthorizationConcern.ensureBroadcastExists(
        ctx,
      )
    await this.broadcastValidationAndAuthorizationConcern.ensureHasPermissions(
      ctx,
    )

    const { success, issues } = await safeParseAsync(
      SendBroadcastDto,
      broadcast,
    )

    if (!success) throw E_VALIDATION_FAILED(issues)

    if (broadcast.status !== 'DRAFT')
      throw E_VALIDATION_FAILED([
        { message: 'Only a draft broadcast can be sent.', field: 'status' },
      ])

    await container.make(SendBroadcastAction).handle(broadcast)

    return ctx.json({ id: broadcast.id })
  }
}
