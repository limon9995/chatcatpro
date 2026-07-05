-- AlterTable: add optional behavior config (persona/tone/coreFields/systemReplies overrides) to BotAgentDefinition
ALTER TABLE "BotAgentDefinition" ADD COLUMN "behaviorConfig" JSONB;
