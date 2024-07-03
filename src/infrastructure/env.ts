import { Secret } from "@poppinss/utils"
import "dotenv/config"
import { cleanEnv, str, num, host, url, makeValidator } from "envalid"

export type EnvVariables = typeof env

const appKey = makeValidator((value) => {
  if (value.length !== 32) {
    throw new Error("APP_KEY must be 32 characters long.")
  }

  return new Secret(value)
})

export const env = cleanEnv(process.env, {
  PORT: num(),
  HOST: host(),
  APP_KEY: appKey({ desc: "Application key." }),
  DATABASE_URL: url(),
  NODE_ENV: str({
    choices: ["development", "test", "production"],
    default: "development",
  }),
})
