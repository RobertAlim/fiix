CREATE TABLE "otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" varchar(15) NOT NULL,
	"code" varchar(6) NOT NULL,
	"expires_at" timestamp NOT NULL
);
