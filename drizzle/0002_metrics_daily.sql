CREATE TABLE "metrics_daily" (
	"seller_id" text NOT NULL,
	"day" date NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"currency" text NOT NULL,
	"values" jsonb NOT NULL,
	CONSTRAINT "metrics_daily_seller_id_day_pk" PRIMARY KEY("seller_id","day")
);
