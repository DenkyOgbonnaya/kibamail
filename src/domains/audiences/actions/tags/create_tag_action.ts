import { eq, and } from "drizzle-orm"
import { CreateTagDto } from "@/domains/audiences/dto/tags/create_tag_dto.js"
import { TagRepository } from "@/domains/audiences/repositories/tag_repository.js"
import { E_VALIDATION_FAILED } from "@/http/responses/errors.js"
import { tags } from "@/infrastructure/database/schema/schema.js"
import { container } from "@/utils/typi.js"

export class CreateTagAction {
  constructor(
    private tagRepository: TagRepository = container.make(TagRepository),
  ) {}

  handle = async (payload: CreateTagDto, audienceId: string) => {
    const existingTag = await this.tagRepository.findFirst({
      where: and(eq(tags.name, payload.name), eq(tags.audienceId, audienceId)),
    })

    if (existingTag) {
      throw E_VALIDATION_FAILED([
        {
          message: "A tag with this name already exists for this audience.",
          field: "name",
        },
      ])
    }

    const tag = await this.tagRepository.create(payload, audienceId)

    return tag
  }
}
