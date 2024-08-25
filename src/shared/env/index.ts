import { Secret } from "@poppinss/utils"
import {
  ip,
  maxLength,
  minLength,
  nonEmpty,
  number,
  object,
  optional,
  picklist,
  pipe,
  safeParse,
  string,
  url,
} from "valibot"

export type EnvVariables = {
  PORT: number
  HOST: string
  APP_KEY: Secret<string>
  APP_URL: string
  DATABASE_URL: string
  CLICKHOUSE_DATABASE_URL: string
  REDIS_URL: string
  NODE_ENV: "development" | "test" | "production"

  isTest: boolean
  isProd: boolean
  isDev: boolean

  SMTP_HOST: string
  SMTP_PORT: number
  SMTP_USER: string
  SMTP_PASS: string
}

export type ConfigVariables = typeof config

const DEFAULT_PORT = "5566"

const envValidationSchema = object({
  PORT: optional(string(), DEFAULT_PORT),
  HOST: pipe(
    optional(string(), `http://localhost:${DEFAULT_PORT}`),
    nonEmpty(),
    ip(),
  ),
  APP_KEY: pipe(string(), nonEmpty(), minLength(32), maxLength(32)),
  APP_URL: pipe(
    optional(string(), `http://localhost:${DEFAULT_PORT}`),
    nonEmpty(),
    url(),
  ),
  CLICKHOUSE_DATABASE_URL: pipe(string(), nonEmpty()),
  REDIS_URL: pipe(string(), nonEmpty()),
  DATABASE_URL: pipe(string(), nonEmpty()),
  NODE_ENV: picklist(["development", "test", "production"]),
  SMTP_HOST: pipe(string(), nonEmpty()),
  SMTP_PORT: number(),
  SMTP_USER: pipe(string(), nonEmpty()),
  SMTP_PASS: pipe(string(), nonEmpty()),
})

const parsed = safeParse(envValidationSchema, {
  ...process.env,
  SMTP_PORT: Number.parseInt(process.env.SMTP_PORT ?? ""),
})

if (!parsed.success) {
  console.dir({
    "🟡 ENVIRONMENT_VARIABLES_VALIDATION_FAILED": parsed.issues.map((issue) => [
      issue?.path?.[0]?.key,
      issue?.message,
    ]),
  })
}

const parsedOutput = parsed.output as Omit<EnvVariables, "APP_KEY"> & {
  APP_KEY: string
}

export const env = {
  ...parsedOutput,
  APP_KEY: new Secret(parsedOutput.APP_KEY as string),
} as EnvVariables

env.isTest = env.NODE_ENV === "test"
env.isProd = env.NODE_ENV === "production"
env.isDev = env.NODE_ENV === "development"

const SHORT_NAME = "kibamail"

// This is where we host the bounce processing server.
// All incoming bounces and complaints from our customers will go through here.
// They eventually get fed into a kafka topic that multiple services will consume.

// The SPF configuration for this domain must point to (include) spf.kbmta.net, which further includes all our sending subnets and ip addresses.
const BOUNCE_HOST_NAME = "kb-bounces.kbmta.net"

// This is where we host the SPF DNS entry.
// All our subnets and IP addresses for email sending must be configured as a TXT record on this domain.
// All our domains like kb-bounces.kbmta.net, kb-marketing.kbmta.net, kibamail.com etc. must include this domain in its SPF record.
const SPF_HOST_NAME = "spf.kbmta.net"

// This is where we host the transactional email server.
// All inbound transactional emails will go through here, including those sent via HTTP api.
const SMTP_HOST_NAME = "smtp.kbmta.net"

// This is where we host the marketing email server.
// All inbound marketing emails will go through here, including those sent via HTTP api.
const SMTP_MARKETING_HOST_NAME = "smtp-mkg.kbmta.net"

// This is the default subdomain customers will use when configuring the `Return-Path` DNS entry.
// Example: Google uses our infrastructure to send emails, so they'll configure the following dns entry:
// kb-bounces.google.com. IN CNAME kb-bounces.kbmta.net
const DEFAULT_BOUNCE_SUBDOMAIN = "kb-bounces"

export const config = {
  ...env,
  software: {
    shortName: SHORT_NAME,
    teamHeader: `x-${SHORT_NAME}-team-id`,
    bounceHost: BOUNCE_HOST_NAME,
    bounceSubdomain: DEFAULT_BOUNCE_SUBDOMAIN,
  },
}
