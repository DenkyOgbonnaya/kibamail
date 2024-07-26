import {
  CreateTopicCommand,
  DeleteTopicCommand,
  ListSubscriptionsByTopicCommand,
  ListTopicsCommand,
  SNSClient,
  SubscribeCommand,
} from '@aws-sdk/client-sns'
import type { Secret } from '@poppinss/utils'

import { E_OPERATION_FAILED } from '@/http/responses/errors.ts'
import { sleep } from '@/utils/sleep.js'

export class SNSService {
  private sns: SNSClient

  constructor(
    accessKeyId: Secret<string>,
    secretAccessKey: Secret<string>,
    region: string,
  ) {
    this.sns = new SNSClient({
      credentials: {
        accessKeyId: accessKeyId.release(),
        secretAccessKey: secretAccessKey.release(),
      },
      region,
    })
  }

  async checkAccess(): Promise<boolean> {
    try {
      await this.sns.send(new ListTopicsCommand({}))

      return true
    } catch (error) {
      return false
    }
  }

  async createSnsTopic(topicName: string) {
    const existingTopic = await this.getSnsTopic(topicName)

    if (existingTopic) return existingTopic

    return this.sns.send(new CreateTopicCommand({ Name: topicName }))
  }

  async deleteSnsTopic(TopicArn: string) {
    return this.sns.send(new DeleteTopicCommand({ TopicArn }))
  }

  async getSnsTopic(topicName: string) {
    const topics = await this.sns.send(new ListTopicsCommand({}))

    const topic = topics.Topics?.find((topic) =>
      topic.TopicArn?.endsWith(`:${topicName}`),
    )

    return topic ?? null
  }

  async createSnsSubscription(topicName: string, endpoint: string) {
    const topic = await this.getSnsTopic(topicName)

    if (!topic) {
      throw E_OPERATION_FAILED(`Topic ${topicName} does not exist.`)
    }

    const subscriber = await this.sns.send(
      new SubscribeCommand({
        TopicArn: topic.TopicArn,
        Protocol: 'https',
        Endpoint: endpoint,
        Attributes: {
          DeliveryPolicy: JSON.stringify({
            throttlePolicy: {
              maxReceivesPerSecond: 5,
            },
          }),
        },
      }),
    )

    // Keep retrying to make sure the sns was confirmed via webhook.
    let tries = 3
    let subscriptionConfirmed = false

    while (subscriptionConfirmed === false && tries > 0) {
      await sleep(1500)

      const subscribers = await this.sns.send(
        new ListSubscriptionsByTopicCommand({
          TopicArn: topic.TopicArn,
        }),
      )

      const subscription = subscribers.Subscriptions?.find(
        (subscription) => subscription.Endpoint === endpoint,
      )

      if (
        subscription &&
        subscription?.SubscriptionArn !== 'PendingConfirmation'
      ) {
        subscriptionConfirmed = true
      }

      tries--
    }

    if (subscriptionConfirmed === false) {
      throw E_OPERATION_FAILED(
        'Could not confirm subscription on AWS email provider.. Please try creating the mailer again.',
      )
    }

    return subscriber
  }
}
