import {
  AbTestsBroadcastsQueue,
  BroadcastsQueue,
} from '@/shared/queue/queue.js'
import type { BroadcastWithoutContent } from '@/database/schema/types.js'
import { differenceInSeconds } from '@/utils/dates.js'
import { container } from '@/utils/typi.js'
import { SendBroadcastJob } from '@/broadcasts/jobs/send_broadcast_job.js'
import { BroadcastRepository } from '@/broadcasts/repositories/broadcast_repository.js'
import { SendAbTestBroadcastJob } from '@/broadcasts/jobs/send_ab_test_broadcast_job.ts'

export class SendBroadcastAction {
  constructor(
    private broadcastRepository = container.make(BroadcastRepository),
  ) {}

  async handle(broadcast: BroadcastWithoutContent) {
    if (broadcast.isAbTest) {
      await AbTestsBroadcastsQueue.add(
        SendAbTestBroadcastJob.id,
        { broadcastId: broadcast.id },
        {
          delay: broadcast.sendAt
            ? differenceInSeconds(new Date(), broadcast.sendAt)
            : 0,
        },
      )
    }

    if (!broadcast.isAbTest) {
      await BroadcastsQueue.add(
        SendBroadcastJob.id,
        { broadcastId: broadcast.id },
        {
          delay: broadcast.sendAt
            ? differenceInSeconds(new Date(), broadcast.sendAt)
            : 0,
        },
      )
    }

    await this.broadcastRepository.update(broadcast.id, {
      status: 'QUEUED_FOR_SENDING',
    })
  }
}
