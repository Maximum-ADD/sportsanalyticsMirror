-- Personal API access for signed-in users: ApiConsumer gains an optional
-- owner (null = admin-created external consumer, set = user's own
-- auto-provisioned consumer). One consumer per user, keys and usage
-- history cascade with the account.
ALTER TABLE "ApiConsumer" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "ApiConsumer_userId_key" ON "ApiConsumer"("userId");
ALTER TABLE "ApiConsumer" ADD CONSTRAINT "ApiConsumer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
