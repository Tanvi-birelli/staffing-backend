const { pool } = require('../config/db');

async function migrate() {
    try {
        console.log('Starting migration: Creating job_applications table...');
        const connection = await pool.getConnection();
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS job_applications (
                application_id INT AUTO_INCREMENT PRIMARY KEY,
                job_id INT NOT NULL,
                jobseeker_id INT NOT NULL,
                application_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(50) DEFAULT 'Pending',
                FOREIGN KEY (job_id) REFERENCES jobs(job_id),
                FOREIGN KEY (jobseeker_id) REFERENCES users(user_id)
            );
        `);
        console.log('Migration successful: job_applications table created.');
        connection.release();
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate(); 