DROP TABLE "deployment_active" CASCADE;--> statement-breakpoint
CREATE VIEW "public"."active_deployment" AS (
    SELECT
        *
    FROM
        "deployments"
    WHERE
        "deployments"."deployedHere" = True
  );