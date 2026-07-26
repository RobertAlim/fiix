-- The printers table has carried two separate client-reference columns
-- since migration 0020: the meaningful one (physical column "clientId",
-- mapped in db/schema.ts as the `deployedClient` property, used as the
-- printer's immutable ORIGINAL client) and a second, literal column also
-- named "deployedClient" that db/schema.ts has never referenced and no
-- application code has ever populated. That orphan column being NOT NULL
-- is what caused inserts into printers to fail. It is unrelated to the
-- original/current-client distinction and is not being repurposed here —
-- just relaxed so it stops blocking writes.
ALTER TABLE "printers" ALTER COLUMN "deployedClient" DROP NOT NULL;
