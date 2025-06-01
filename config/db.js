const dotenv = require("dotenv");
const mysql = require('mysql2/promise');
dotenv.config();
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'backend_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
//console.log('DB_PASSWORD from db.js:', process.env.DB_PASSWORD); 
async function testDbConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('Successfully connected to the database.');
        connection.release();
    } catch (error) {
        console.error('Error connecting to the database:', error);
        process.exit(1); // Exit process if database connection fails
    }
}

module.exports = {
    pool,
    testDbConnection
}; 