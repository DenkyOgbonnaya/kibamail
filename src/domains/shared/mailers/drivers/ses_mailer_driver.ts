import type {
  MailObject,
  MailerDriver,
  MailerDriverError,
  MailerDriverResponse,
} from '@/domains/shared/mailers/mailer_types.ts'

export class AWSSESDriver implements MailerDriver {
  async send(
    mail: MailObject,
  ): Promise<[MailerDriverResponse, MailerDriverError]> {
    return [{ messageId: 'true' }, null]
  }
}
