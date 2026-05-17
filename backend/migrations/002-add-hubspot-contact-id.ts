import { QueryInterface } from 'sequelize';

// 001-create-all-tables already includes this column on fresh databases.
// Using IF NOT EXISTS so this migration is safe to run either way.

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    ALTER TABLE "projects"
      ADD COLUMN IF NOT EXISTS "hubspotContactId" VARCHAR(255) DEFAULT NULL;
  `);

  await queryInterface.sequelize.query(`
    CREATE INDEX IF NOT EXISTS "projects_hubspot_contact_id_idx"
      ON "projects" ("hubspotContactId")
      WHERE "hubspotContactId" IS NOT NULL;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "projects_hubspot_contact_id_idx";`);
  await queryInterface.sequelize.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "hubspotContactId";`);
}
