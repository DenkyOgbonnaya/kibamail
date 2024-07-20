import { boolean, InferInput, object, optional } from "valibot"

export const DeleteMailerIdentitySchema = object({
  deleteOnProvider: optional(boolean()),
})

export type DeleteMailerIdentityDto = InferInput<
  typeof DeleteMailerIdentitySchema
>
