// One-off backfill: generates the actual PDF for every certificate with pdf_file_id
// IS NULL. PDF generation itself has been fully implemented since certificate.routes.ts's
// POST / route (via generateCertificatePDF, pdfkit) -- but db/seed_demo_activity.sql
// inserts certificate rows directly into the `certificates` table for demo data, bypassing
// that route entirely, so every seeded certificate has never had a PDF generated.
//
// Run from backend/: npx ts-node src/scripts/backfill_certificate_pdfs.ts
import { DatabaseService } from '../services/database.service';
import { generateCertificatePDF } from '../routes/certificate.routes';
import { IS_PG } from '../database/db-helpers';

async function main() {
  await DatabaseService.initialize();

  const certificates = await DatabaseService.query<any>(
    `SELECT c.id, c.serial, c.tenant_id, c.user_id, c.issued_at, u.display_name as user_name, co.title as course_title
     FROM certificates c
     JOIN users u ON c.user_id = u.id
     JOIN courses co ON c.course_id = co.id
     WHERE c.pdf_file_id IS NULL`
  );

  console.log(`Found ${certificates.length} certificate(s) missing a PDF.`);

  for (const cert of certificates) {
    const pdfPath = await generateCertificatePDF(cert.serial, cert.user_name, cert.course_title, cert.issued_at);

    const fileResult = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO file_assets (tenant_id, filename, mime_type, storage_key, created_by)
           VALUES (@tenantId, @filename, 'application/pdf', @storageKey, @createdBy)
           RETURNING id`
        : `INSERT INTO file_assets (tenant_id, filename, mime_type, storage_key, created_by)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @filename, 'application/pdf', @storageKey, @createdBy)`,
      {
        tenantId: cert.tenant_id,
        filename: `certificate_${cert.serial}.pdf`,
        storageKey: pdfPath,
        createdBy: cert.user_id,
      }
    );

    await DatabaseService.execute('UPDATE certificates SET pdf_file_id = @fileId WHERE id = @id', {
      fileId: fileResult[0].id,
      id: cert.id,
    });

    console.log(`  Generated PDF for certificate ${cert.serial} (id ${cert.id}) -> ${pdfPath}`);
  }

  await DatabaseService.close();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
