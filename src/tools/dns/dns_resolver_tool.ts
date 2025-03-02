import { apiEnv } from "@/api/env/api_env.js"
import dns from "node:dns/promises"

import { DnsConfigurationTool } from "@/tools/dns/dns_configuration_tool.js"

import { container } from "@/utils/typi.js"

export class DnsResolverTool {
  private domain: string

  private dnsConfigurationTool: DnsConfigurationTool

  constructor(private env = apiEnv) {}

  forDomain(domain: string) {
    this.domain = domain

    this.dnsConfigurationTool = container
      .make(DnsConfigurationTool)
      .forDomain(domain)

    return this
  }

  private async resolveCnameRecords() {
    try {
      return await dns.resolveCname(
        `${this.env.software.bounceSubdomain}.${this.domain}`,
      )
    } catch (error) {
      return [] as string[]
    }
  }

  private async resolveTxtRecords() {
    try {
      return await dns.resolveTxt(this.domain)
    } catch (error) {
      return [] as string[]
    }
  }

  private async resolveDkimRecord(dkimSubDomain: string) {
    try {
      return await dns.resolveTxt(`${dkimSubDomain}.${this.domain}`)
    } catch (error) {
      return [] as string[]
    }
  }

  private isDkimConfigured(
    txtRecords: string[],
    publicKey: string,
    dkimSubDomain: string,
  ) {
    return txtRecords.find(
      (record) =>
        record ===
        this.dnsConfigurationTool.getRecords(publicKey, dkimSubDomain).dkim
          .value,
    )
  }

  private isCnameConfigured(cnameRecords: string[]) {
    return cnameRecords.some(
      (record) => record === this.env.software.bounceHost,
    )
  }

  async resolve(publicKey: string, dkimSubDomain: string) {
    let [cnameRecords, dkimTxtRecords] = await Promise.all([
      this.resolveCnameRecords(),
      this.resolveDkimRecord(dkimSubDomain),
    ])

    dkimTxtRecords = dkimTxtRecords.map((record) =>
      Array.isArray(record) ? record.join("") : record,
    ) as string[]

    return {
      cnameRecords,
      dmarcConfigured: false,
      cnameConfigured: this.isCnameConfigured(cnameRecords),
      dkimConfigured: this.isDkimConfigured(
        dkimTxtRecords,
        publicKey,
        dkimSubDomain,
      ),
      returnPathConfigured: cnameRecords.includes(
        this.env.software.bounceHost,
      ),
    }
  }
}
