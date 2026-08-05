-- Track whether a client's custom domain has been DNS-verified + SSL-provisioned
ALTER TABLE "Page" ADD COLUMN "customDomainActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Page" ADD COLUMN "customDomainCheckedAt" TIMESTAMP(3);
