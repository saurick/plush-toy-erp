-- Modify "outsourcing_facts" table
ALTER TABLE "outsourcing_facts" DROP CONSTRAINT "outsourcing_facts_type_allowed", ADD CONSTRAINT "outsourcing_facts_type_allowed" CHECK ((fact_type)::text = ANY ((ARRAY['MATERIAL_ISSUE'::character varying, 'RETURN_RECEIPT'::character varying])::text[]));
