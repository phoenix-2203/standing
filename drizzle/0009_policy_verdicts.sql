CREATE TABLE "policy_verdicts" (
	"seller_id" text NOT NULL,
	"product_key" text NOT NULL,
	"product" jsonb NOT NULL,
	"verdict" jsonb NOT NULL,
	"policy_last_updated" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_verdicts_seller_id_product_key_pk" PRIMARY KEY("seller_id","product_key")
);
