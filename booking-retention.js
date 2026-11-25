export async function deleteExpiredBookingContacts(db) {
    await db.query(`
        UPDATE bookings
        SET name = '', email = '', contact_deleted_at = CURRENT_TIMESTAMP
        WHERE contact_deleted_at IS NULL
          AND ((day::timestamp + (start_hour + hours) * INTERVAL '1 hour' + INTERVAL '1 month')
               AT TIME ZONE 'Europe/Berlin') <= CURRENT_TIMESTAMP
    `);
}
