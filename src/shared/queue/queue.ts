import { AVAILABLE_QUEUES } from "./config.js"
import { Queue as BullQueue } from "bullmq"

import { makeRedis } from "@/shared/container/index.ts"

export const BroadcastsQueue = () =>
  new BullQueue(AVAILABLE_QUEUES.broadcasts, {
    connection: makeRedis(),
  })

export const AbTestsBroadcastsQueue = () =>
  new BullQueue(AVAILABLE_QUEUES.abtests_broadcasts, {
    connection: makeRedis(),
  })

export const AutomationsQueue = () =>
  new BullQueue(AVAILABLE_QUEUES.automations, {
    connection: makeRedis(),
  })

export const AccountsQueue = () =>
  new BullQueue(AVAILABLE_QUEUES.accounts, {
    connection: makeRedis(),
  })

export const TransactionalQueue = () =>
  new BullQueue(AVAILABLE_QUEUES.transactional, {
    connection: makeRedis(),
  })

export const SendingDomainsQueue = () =>
  new BullQueue(AVAILABLE_QUEUES.sending_domains, {
    connection: makeRedis(),
  })

export class Queues {
  broadcasts = BroadcastsQueue
  abTestsBroadcasts = AbTestsBroadcastsQueue
  automations = AutomationsQueue
  accounts = AccountsQueue
  transactional = TransactionalQueue
  sending_domains = SendingDomainsQueue
}

export const Queue = new Queues()
