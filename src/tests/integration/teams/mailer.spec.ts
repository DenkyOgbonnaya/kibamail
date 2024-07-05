import {
  BehaviorOnMXFailure,
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  GetAccountSendingEnabledCommand,
  GetIdentityDkimAttributesCommand,
  GetIdentityMailFromDomainAttributesCommand,
  GetIdentityVerificationAttributesCommand,
  GetSendQuotaCommand,
  ListIdentitiesCommand,
  SESClient,
  SetIdentityMailFromDomainCommand,
} from "@aws-sdk/client-ses"
import { CreateEmailIdentityCommand } from "@aws-sdk/client-sesv2"
import {
  ListSubscriptionsByTopicCommand,
  ListTopicsCommand,
  SNSClient,
  SubscribeCommand,
} from "@aws-sdk/client-sns"
import { faker } from "@faker-js/faker"
import { Prisma } from "@prisma/client"
import { mockClient } from "aws-sdk-client-mock"
import { container } from "tsyringe"
import { beforeEach, describe, test, vi } from "vitest"

import { MailerIdentityRepository } from "@/domains/teams/repositories/mailer_identity_repository"
import { MailerRepository } from "@/domains/teams/repositories/mailer_repository"
import { makeConfig, makeDatabase } from "@/infrastructure/container"
import { createUser } from "@/tests/mocks/auth/users"
import { cleanMailers } from "@/tests/mocks/teams/teams"
import { injectAsUser } from "@/tests/utils/http"
import * as sleepUtils from "@/utils/sleep"

const SESMock = mockClient(SESClient)
const SNSMock = mockClient(SNSClient)

describe("Teams / Mailers", () => {
  beforeEach(() => {
    SNSMock.reset()
    SESMock.reset()
  })

  test("can create mailers", async ({ expect }) => {
    const { user } = await createUser()

    const mailerPayload = {
      name: faker.string.uuid(),
      provider: "AWS_SES",
    }

    const response = await injectAsUser(user, {
      method: "POST",
      path: "/mailers",
      body: mailerPayload,
    })

    const json = await response.json()

    expect(response.statusCode).toBe(200)
    expect(json.name).toBe(mailerPayload.name)
    expect(json.provider).toBe(mailerPayload.provider)

    await cleanMailers()
  })

  test("can update mailers while creating a domain sending identity", async ({
    expect,
  }) => {
    await cleanMailers()
    const { user, team } = await createUser()
    const database = makeDatabase()

    const mailerPayload = {
      name: faker.string.uuid(),
      provider: "AWS_SES",
    }

    const response = await injectAsUser(user, {
      method: "POST",
      path: "/mailers",
      body: mailerPayload,
    })

    const updateConfigPayload = {
      accessKey: faker.string.alphanumeric({ length: 16 }),
      accessSecret: faker.string.alphanumeric({ length: 16 }),
      region: "us-east-1",
      domain: "newsletter.example.com",
    }

    const updateResponse = await injectAsUser(user, {
      method: "PATCH",
      path: `/mailers/${(await response.json()).id}`,
      body: {
        configuration: updateConfigPayload,
      },
    })

    // mock aws clients to resolve api calls.
    SESMock.onAnyCommand().resolves({})
    SNSMock.onAnyCommand().resolves({})

    expect(updateResponse.statusCode).toBe(200)

    const mailerRepository = container.resolve(MailerRepository)

    const mailer = (await database.mailer.findFirst({
      where: {
        name: mailerPayload.name,
        provider: "AWS_SES",
      },
      include: {
        identities: true,
      },
    }))!

    expect(mailer).not.toBeNull()
    const domainIdentity = mailer.identities.find(
      (identity) =>
        identity.type === "DOMAIN" &&
        identity.value === updateConfigPayload.domain,
    )!

    expect(domainIdentity).not.toBeNull()

    expect(
      (domainIdentity.configuration as { publicKey: string }).publicKey.length,
    ).toBe(216)
    expect(domainIdentity.status).toBe("PENDING")

    const updatedConfiguration = mailerRepository.getDecryptedConfiguration(
      mailer?.configuration,
      team.configurationKey,
    )
    expect(updatedConfiguration.accessKey.release()).toEqual(
      updateConfigPayload.accessKey,
    )
    expect(updatedConfiguration.accessSecret.release()).toEqual(
      updateConfigPayload.accessSecret,
    )

    const mailerIdentityRepository = container.resolve(MailerIdentityRepository)

    const appShortName = makeConfig().software.shortName
    const { privateKey: decodedMailerIdentityPrivateKey } =
      await mailerIdentityRepository.decryptRsaPrivateKey(
        team.configurationKey,
        (domainIdentity.configuration as { privateKey: string }).privateKey,
      )

    // check ses calls

    const firstCallToCheckCredentialAccess = SESMock.calls()[0]

    expect(firstCallToCheckCredentialAccess.args[0]).toBeInstanceOf(
      GetSendQuotaCommand,
    )

    const secondCallToCheckCredentialAccess = SESMock.calls()[1]
    expect(secondCallToCheckCredentialAccess.args[0]).toBeInstanceOf(
      ListIdentitiesCommand,
    )

    const thirdCallToCreateDomainIdentity = SESMock.calls()[2]
    expect(thirdCallToCreateDomainIdentity.args[0]).toBeInstanceOf(
      CreateEmailIdentityCommand,
    )
    expect(thirdCallToCreateDomainIdentity.args[0].input).toEqual({
      EmailIdentity: updateConfigPayload.domain,
      ConfigurationSetName: `${appShortName}_${mailer.id}`,
      DkimSigningAttributes: {
        DomainSigningPrivateKey: decodedMailerIdentityPrivateKey.release(),
        DomainSigningSelector: appShortName,
      },
    })

    const fourthCallToSetIdentityDomain = SESMock.calls()[3]

    expect(fourthCallToSetIdentityDomain.args[0]).toBeInstanceOf(
      SetIdentityMailFromDomainCommand,
    )
    expect(fourthCallToSetIdentityDomain.args[0].input).toEqual({
      Identity: updateConfigPayload.domain,
      MailFromDomain: `send.${updateConfigPayload.domain}`,
      BehaviorOnMXFailure: BehaviorOnMXFailure.UseDefaultValue,
    })

    // check sns calls
    const firstSnsCallToCheckCredentialAccess = SNSMock.calls()[0]
    expect(firstSnsCallToCheckCredentialAccess.args[0]).toBeInstanceOf(
      ListTopicsCommand,
    )
  })

  test("can install a mailer and reconnect it with new credentials if access is revoked", async ({
    expect,
  }) => {
    await cleanMailers()
    const { user, setting, team } = await createUser()

    const sleepMock = vi
      .spyOn(sleepUtils, "sleep")
      .mockImplementation(() => Promise.resolve())

    const mailerPayload = {
      name: faker.string.uuid(),
      provider: "AWS_SES",
    }

    const response = await injectAsUser(user, {
      method: "POST",
      path: "/mailers",
      body: mailerPayload,
    })

    const updateConfigPayload = {
      accessKey: faker.string.alphanumeric({ length: 16 }),
      accessSecret: faker.string.alphanumeric({ length: 16 }),
      region: "us-east-1",
      domain: "newsletter.example.com",
    }

    const mailerId = (await response.json()).id

    const updateResponse = await injectAsUser(user, {
      method: "PATCH",
      path: `/mailers/${(await response.json()).id}`,
      body: {
        configuration: updateConfigPayload,
      },
    })

    expect(updateResponse.statusCode).toBe(200)

    SNSMock.resetHistory()
    SESMock.resetHistory()

    const configurationName = `${makeConfig().software.shortName}_${mailerId}`

    const TopicArn = `arn:aws:sns:us-east-1:123456789012:${configurationName}`
    const SubscriptionArn = `arn:aws:sns:us-east-1:123456789012:${configurationName}`

    SNSMock.on(ListTopicsCommand).resolves({
      Topics: [
        {
          TopicArn,
        },
      ],
    })

    SNSMock.on(ListSubscriptionsByTopicCommand).resolves({
      Subscriptions: [
        {
          SubscriptionArn,
          Protocol: "https",
          Endpoint: setting.url!,
        },
      ],
    })

    SNSMock.on(SubscribeCommand).resolves({
      SubscriptionArn,
    })

    const installResponse = await injectAsUser(user, {
      method: "POST",
      path: `/mailers/${(await response.json()).id}/install`,
    })

    expect(installResponse.statusCode).toBe(200)

    const createConfigurationSet = SESMock.calls()[3]
    const setDestinationOfSnsNotifications = SESMock.calls()[5]

    expect(createConfigurationSet.args[0]).toBeInstanceOf(
      CreateConfigurationSetCommand,
    )
    expect(createConfigurationSet.args[0].input).toEqual({
      ConfigurationSet: { Name: configurationName },
    })

    expect(setDestinationOfSnsNotifications.args[0]).toBeInstanceOf(
      CreateConfigurationSetEventDestinationCommand,
    )
    expect(setDestinationOfSnsNotifications.args[0].input).toEqual({
      ConfigurationSetName: configurationName,
      EventDestination: {
        Enabled: true,
        Name: configurationName,
        MatchingEventTypes: ["reject", "bounce", "complaint", "click", "open"],
        SNSDestination: {
          TopicARN: TopicArn,
        },
      },
    })

    const subscribeCommand = SNSMock.calls()[3]

    expect(subscribeCommand.args[0]).toBeInstanceOf(SubscribeCommand)

    expect(subscribeCommand.args[0].input).toEqual({
      Protocol: "https",
      TopicArn,
      Endpoint: `${setting.url!}/webhooks/ses`,
      Attributes: {
        DeliveryPolicy: `{"throttlePolicy":{"maxReceivesPerSecond":5}}`,
      },
    })

    // call profile to refresh identity statuses. but this time, simulate a situation where the api keys have expired

    SESMock.on(GetSendQuotaCommand).rejects({
      message: "Access keys have expired. Requires rotation.",
    })

    const profileResponse = await injectAsUser(user, {
      method: "GET",
      path: "/auth/profile",
    })

    const profile = await profileResponse.json()

    expect(profile.teams[0].mailer.status).toEqual(
      "ACCESS_KEYS_LOST_PROVIDER_ACCESS",
    )

    SESMock.on(GetSendQuotaCommand).resolves({})

    const reconnectConfigPayload = {
      accessKey: faker.string.alphanumeric({ length: 32 }),
      accessSecret: faker.string.alphanumeric({ length: 32 }),
      region: "us-east-1",
      domain: "newsletter.example.com",
    }

    const reconnectResponse = await injectAsUser(user, {
      method: "PATCH",
      path: `/mailers/${mailerId}/reconnect`,
      body: {
        configuration: reconnectConfigPayload,
      },
    })

    expect(reconnectResponse.statusCode).toBe(200)

    const mailerRepository = container.resolve(MailerRepository)

    const freshMailer = (await mailerRepository.findById(mailerId))!

    const configuration = mailerRepository.getDecryptedConfiguration(
      freshMailer?.configuration,
      team.configurationKey,
    )

    expect(configuration.accessKey.release()).toEqual(
      reconnectConfigPayload.accessKey,
    )
    expect(configuration.accessSecret.release()).toEqual(
      reconnectConfigPayload.accessSecret,
    )

    sleepMock.mockRestore()
  })

  test("can update mailers while creating an email sending identity", async ({
    expect,
  }) => {
    await cleanMailers()
    const { user } = await createUser()
    const database = makeDatabase()

    const mailerPayload = {
      name: faker.string.uuid(),
      provider: "AWS_SES",
    }

    // mock aws clients to resolve api calls.
    SESMock.onAnyCommand().resolves({})
    SNSMock.onAnyCommand().resolves({})

    const response = await injectAsUser(user, {
      method: "POST",
      path: "/mailers",
      body: mailerPayload,
    })

    const updateConfigPayload = {
      accessKey: faker.string.alphanumeric({ length: 16 }),
      accessSecret: faker.string.alphanumeric({ length: 16 }),
      region: "us-east-1",
      email: "from@example.com",
    }

    const updateResponse = await injectAsUser(user, {
      method: "PATCH",
      path: `/mailers/${(await response.json()).id}`,
      body: {
        configuration: updateConfigPayload,
      },
    })

    expect(updateResponse.statusCode).toBe(200)

    const mailer = (await database.mailer.findFirst({
      where: {
        name: mailerPayload.name,
        provider: "AWS_SES",
      },
      include: {
        identities: true,
      },
    }))!

    expect(mailer).not.toBeNull()
    const domainIdentity = mailer.identities.find(
      (identity) =>
        identity.type === "EMAIL" &&
        identity.value === updateConfigPayload.email,
    )!

    expect(domainIdentity).not.toBeNull()
    expect(domainIdentity.configuration).toBe(null)
    expect(domainIdentity.status).toBe("PENDING")

    const thirdCallToCreateEmailIdentityCommand = SESMock.calls()[2]

    expect(thirdCallToCreateEmailIdentityCommand.args[0]).toBeInstanceOf(
      CreateEmailIdentityCommand,
    )
    expect(thirdCallToCreateEmailIdentityCommand.args[0].input).toEqual({
      EmailIdentity: updateConfigPayload.email,
      ConfigurationSetName: `${makeConfig().software.shortName}_${mailer.id}`,
    })
  })

  test("cannot update mailer without providing a sender identity, either a domain or email", async ({
    expect,
  }) => {
    await cleanMailers()
    const { user, team } = await createUser()
    const database = makeDatabase()

    const mailerPayload = {
      name: faker.string.uuid(),
      provider: "AWS_SES",
    }

    const response = await injectAsUser(user, {
      method: "POST",
      path: "/mailers",
      body: mailerPayload,
    })

    const updateConfigPayload = {
      accessKey: faker.string.alphanumeric({ length: 16 }),
      accessSecret: faker.string.alphanumeric({ length: 16 }),
      region: "us-east-1",
    }

    const updateResponse = await injectAsUser(user, {
      method: "PATCH",
      path: `/mailers/${(await response.json()).id}`,
      body: {
        configuration: updateConfigPayload,
      },
    })

    expect(await updateResponse.json()).toEqual({
      errors: [
        {
          message:
            "Either domain or email must be provided to enable sending emails.",
          field: "configuration",
        },
      ],
    })

    const mailerRepository = container.resolve(MailerRepository)

    const mailer = (await database.mailer.findFirst({
      where: {
        name: mailerPayload.name,
        provider: "AWS_SES",
      },
      include: {
        identities: true,
      },
    }))!

    const decryptedConfiguration = mailerRepository.getDecryptedConfiguration(
      mailer.configuration,
      team.configurationKey,
    )

    // make sure keys were not saved and config was not updated.
    expect(decryptedConfiguration.accessKey.release()).toBe("")
    expect(decryptedConfiguration.accessSecret.release()).toBe("")
  })

  test("can fetch all mailers and see sending domain approval status when fetching user profile", async ({
    expect,
  }) => {
    const { user } = await createUser({ createMailerWithIdentity: true })

    SESMock.reset()
    SESMock.resetHistory()

    SESMock.on(GetIdentityDkimAttributesCommand).resolves({
      DkimAttributes: {
        "newsletter.example.com": {
          DkimEnabled: true,
          DkimVerificationStatus: "Success",
          DkimTokens: [],
        },
      },
    })

    SESMock.on(GetIdentityVerificationAttributesCommand).resolves({
      VerificationAttributes: {
        "newsletter.example.com": {
          VerificationStatus: "Success",
          VerificationToken: faker.string.alphanumeric(),
        },
      },
    })

    SESMock.on(GetIdentityMailFromDomainAttributesCommand).resolves({
      MailFromDomainAttributes: {
        "newsletter.example.com": {
          BehaviorOnMXFailure: BehaviorOnMXFailure.UseDefaultValue,
          MailFromDomain: "send.newsletter.example.com",
          MailFromDomainStatus: "Success",
        },
      },
    })

    SESMock.on(GetAccountSendingEnabledCommand).resolves({ Enabled: true })
    SESMock.on(GetSendQuotaCommand).resolves({
      Max24HourSend: 10000,
      MaxSendRate: 10,
      SentLast24Hours: 1023,
    })

    const response = await injectAsUser(user, {
      method: "GET",
      path: "/auth/profile",
    })

    const json = await response.json()

    expect(json.teams[0].mailer.status).toBe("READY")
    expect(json.teams[0].mailer.identities[0].status).toBe("APPROVED")

    const database = makeDatabase()

    const mailer = await database.mailer.findFirst({
      where: {
        id: json.teams[0].mailer.id,
      },
    })

    expect(mailer).not.toBeNull()

    expect(mailer?.sendingEnabled).toBe(true)
    expect(mailer?.maxSendRate).toBe(10)
    expect(mailer?.max24HourSend).toBe(10000)
  })

  test("when fetching profile, a mailer sync error with provider does not prevent results from being fetched", async ({
    expect,
  }) => {
    const { user } = await createUser({ createMailerWithIdentity: true })

    SESMock.on(GetIdentityDkimAttributesCommand).rejects({
      message: "InvalidParameterValue",
    })

    SESMock.on(GetIdentityVerificationAttributesCommand).resolves({
      VerificationAttributes: {
        "newsletter.example.com": {
          VerificationStatus: "Success",
          VerificationToken: faker.string.alphanumeric(),
        },
      },
    })

    SESMock.on(GetIdentityMailFromDomainAttributesCommand).resolves({
      MailFromDomainAttributes: {
        "newsletter.example.com": {
          BehaviorOnMXFailure: BehaviorOnMXFailure.UseDefaultValue,
          MailFromDomain: "send.newsletter.example.com",
          MailFromDomainStatus: "Success",
        },
      },
    })

    SESMock.on(GetAccountSendingEnabledCommand).resolves({ Enabled: true })
    SESMock.on(GetSendQuotaCommand).resolves({
      Max24HourSend: 10000,
      MaxSendRate: 10,
      SentLast24Hours: 1023,
    })

    const response = await injectAsUser(user, {
      method: "GET",
      path: "/auth/profile",
    })

    const json = await response.json()

    expect(json.teams[0].mailer.status).toBe("PENDING")
    expect(json.teams[0].mailer.identities[0].status).toBe("PENDING")
  })

  test("when fetching profile, a mailer loss in credential access results in a flag on the mailer showing loss of aws access, but also allows request to go through", async ({
    expect,
  }) => {
    const { user } = await createUser({ createMailerWithIdentity: true })

    SESMock.reset()
    SESMock.resetHistory()

    SESMock.on(GetSendQuotaCommand).rejects({})
    SESMock.on(ListIdentitiesCommand).rejects({})
    SNSMock.on(ListTopicsCommand).rejects({})

    const response = await injectAsUser(user, {
      method: "GET",
      path: "/auth/profile",
    })

    const json = await response.json()

    expect(json.teams[0].mailer.status).toBe("ACCESS_KEYS_LOST_PROVIDER_ACCESS")
    expect(json.teams[0].mailer.identities[0].status).toBe("PENDING")
  })
})

describe("Mailer identities", () => {
  beforeEach(() => {
    SESMock.reset()
    SESMock.resetHistory()
  })

  test("can create a domain mailer identity", async ({ expect }) => {
    const { user, team } = await createUser({ createMailerWithIdentity: true })

    SESMock.reset()
    SESMock.resetHistory()

    SESMock.on(CreateEmailIdentityCommand).resolves({})
    SESMock.on(SetIdentityMailFromDomainCommand).resolves({})

    const database = makeDatabase()

    const mailerIdentityRepository = container.resolve(MailerIdentityRepository)

    const mailer = (await database.mailer.findFirst({
      where: {
        teamId: team.id,
      },
    }))!

    const mailerIdentityPayload = {
      type: "DOMAIN",
      value: "marketing.gorillaxample.com",
    }

    const response = await injectAsUser(user, {
      method: "POST",
      path: `/mailers/${mailer.id}/identities`,
      body: mailerIdentityPayload,
    })

    expect(response.statusCode).toBe(200)

    const json = await response.json()

    expect(json.value).toBe(mailerIdentityPayload.value)
    expect(json.type).toBe(mailerIdentityPayload.type)
    expect(json.status).toBe("PENDING")
    expect(json.mailerId).toBe(mailer.id)

    const mailerIdentity = (await database.mailerIdentity.findFirst({
      where: { mailerId: mailer.id, value: mailerIdentityPayload.value },
    }))!

    const decryptedMailerIdentityRsaPrivateKey =
      await mailerIdentityRepository.decryptRsaPrivateKey(
        team.configurationKey,
        (mailerIdentity.configuration as Prisma.JsonObject)
          .privateKey as string,
      )

    const config = makeConfig()
    const configurationName = `${config.software.shortName}_${mailer.id}`

    const SesCalls = SESMock.calls()

    const createEmailIdentityCall = SesCalls[0]
    const setIdentityMailFromDomain = SesCalls[1]

    expect(createEmailIdentityCall.args[0]).toBeInstanceOf(
      CreateEmailIdentityCommand,
    )

    expect(createEmailIdentityCall.args[0].input).toEqual({
      EmailIdentity: mailerIdentityPayload.value,
      ConfigurationSetName: configurationName,
      DkimSigningAttributes: {
        DomainSigningPrivateKey:
          decryptedMailerIdentityRsaPrivateKey.privateKey.release(),
        DomainSigningSelector: config.software.shortName,
      },
    })

    expect(setIdentityMailFromDomain.args[0]).toBeInstanceOf(
      SetIdentityMailFromDomainCommand,
    )

    expect(setIdentityMailFromDomain.args[0].input).toEqual({
      Identity: mailerIdentityPayload.value,
      MailFromDomain: `send.${mailerIdentityPayload.value}`,
      BehaviorOnMXFailure: BehaviorOnMXFailure.UseDefaultValue,
    })
  })

  test("can create an email mailer identity", async ({ expect }) => {
    await cleanMailers()
    const { user, team } = await createUser({ createMailerWithIdentity: true })

    SESMock.reset()
    SESMock.resetHistory()

    SESMock.on(CreateEmailIdentityCommand).resolves({})
    SESMock.on(SetIdentityMailFromDomainCommand).resolves({})

    const database = makeDatabase()

    const mailer = (await database.mailer.findFirst({
      where: {
        teamId: team.id,
      },
    }))!

    const mailerIdentityPayload = {
      type: "EMAIL",
      value: "hello@gorillaxample.com",
    }

    const response = await injectAsUser(user, {
      method: "POST",
      path: `/mailers/${mailer.id}/identities`,
      body: mailerIdentityPayload,
    })

    const json = await response.json()

    expect(response.statusCode).toBe(200)
    expect(json.value).toBe(mailerIdentityPayload.value)
    expect(json.type).toBe(mailerIdentityPayload.type)
    expect(json.status).toBe("PENDING")
    expect(json.mailerId).toBe(mailer.id)

    const config = makeConfig()
    const configurationName = `${config.software.shortName}_${mailer.id}`

    const SesCalls = SESMock.calls()

    const createEmailIdentityCall = SesCalls[0]

    expect(createEmailIdentityCall.args[0]).toBeInstanceOf(
      CreateEmailIdentityCommand,
    )

    expect(createEmailIdentityCall.args[0].input).toEqual({
      EmailIdentity: mailerIdentityPayload.value,
      ConfigurationSetName: configurationName,
    })
  })
})
