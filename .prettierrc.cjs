module.exports = {
  semi: false,
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrder: [
    "^@/broadcasts/(.*)$",
    "^@/audiences/(.*)$",
    "^@/teams/(.*)$",
    "^@/auth/(.*)$",
    "^@/automations/(.*)$",
    "^@/content/(.*)$",
    "^@/sending_domains/(.*)$",
    "^@/tools/(.*)$",
    "^@/tests/(.*)$",
    "^@/database/(.*)$",
    "^@/server/(.*)$",
    "^@/http/(.*)$",
    "^@/shared/(.*)$",
    "^@/redis/(.*)$",
    "^@/utils/(.*)$",
  ],
  plugins: ["@trivago/prettier-plugin-sort-imports"],
}
