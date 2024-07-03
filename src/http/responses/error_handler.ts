import * as Boom from "@hapi/boom"
import { FastifyError, FastifyReply, FastifyRequest } from "fastify"

export function globalErrorHandler(
  error: FastifyError,
  request: FastifyRequest,
  response: FastifyReply,
) {
  const isBoomError = Boom.isBoom(error)

  if (isBoomError) {
    const { statusCode } = error.output

    return response.code(statusCode).send(error.data)
  }

  request.log.error(error)

  return response.code(500).send({
    message: "Internal Server Error.",
  })
}
