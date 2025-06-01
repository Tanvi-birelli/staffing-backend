const { pool } = require("../config/db.js");

async function findUserByEmail(email) {
    if (!email) {
        // This case is for when you want to get ALL users, e.g., for VOAT ID generation. 
        // In a real application, this should be handled carefully for performance.
        const [rows] = await pool.execute('SELECT id, voat_id FROM users');
        return rows;
    }
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0];
}

async function findUserByResetToken(token) {
    const [rows] = await pool.execute('SELECT * FROM users WHERE resetToken = ? AND resetExpires > ?', [token, Date.now()]);
    return rows[0];
}

async function findUserByVerificationToken(token) {
    const [rows] = await pool.execute('SELECT * FROM users WHERE verificationToken = ?', [token]);
    return rows[0];
}

async function createUser(userData) {
    const { username, email, hashedPassword, role, voatId, verified, resume_filepath } = userData;

    const [result] = await pool.execute(
        'INSERT INTO users (username, email, password, role, voat_id, verified) VALUES (?, ?, ?, ?, ?, ?)',
        [username, email, hashedPassword, role, voatId, verified]
    );

    const userId = result.insertId;

    if (role === 'jobseeker') {
        await pool.execute(
            'INSERT INTO jobseeker_profiles (user_id, resume_filepath) VALUES (?, ?)',
            [userId, resume_filepath]
        );
    }

    return { id: userId };
}

async function updateUser(userId, updates) {
    const fields = [];
    const values = [];
    for (const key in updates) {
        fields.push(`\`${key}\` = ?`);
        values.push(updates[key]);
    }
    if (fields.length === 0) return;

    values.push(userId);
    await pool.execute(
        `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
        values
    );
}

async function createContact(contactData) {
    const { name, email, subject, message } = contactData;
    const [result] = await pool.execute(
        'INSERT INTO contacts (name, email, subject, message) VALUES (?, ?, ?, ?)',
        [name, email, subject || null, message]
    );
    return { id: result.insertId };
}

async function createAnnouncement(announcementData) {
    const { title, content, author_id } = announcementData;
    const [result] = await pool.execute(
        'INSERT INTO announcements (title, content, author_id) VALUES (?, ?, ?)',
        [title, content, author_id]
    );
    return { id: result.insertId };
}

async function getAllAnnouncements() {
    const [rows] = await pool.execute('SELECT * FROM announcements ORDER BY created_at DESC');
    return rows;
}

async function getAnnouncementById(id) {
    const [rows] = await pool.execute('SELECT * FROM announcements WHERE id = ?', [id]);
    return rows[0];
}

async function updateAnnouncement(id, updates) {
    const fields = [];
    const values = [];
    for (const key in updates) {
        fields.push(`\`${key}\` = ?`);
        values.push(updates[key]);
    }
    if (fields.length === 0) return;

    values.push(id);
    await pool.execute(
        `UPDATE announcements SET ${fields.join(', ')} WHERE id = ?`,
        values
    );
}

async function deleteAnnouncement(id) {
    await pool.execute('DELETE FROM announcements WHERE id = ?', [id]);
}

async function createPendingSignup(signupData) {
    const { tempToken, name, email, hashedPassword, resume_filepath, role, otpCode, otpExpires, lastOtpSent, otpAttempts, blockExpires } = signupData;
    const [result] = await pool.execute(
        'INSERT INTO pending_signups (tempToken, name, email, hashedPassword, resume_filepath, role, otpCode, otpExpires, lastOtpSent, otpAttempts, blockExpires) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [tempToken, name, email, hashedPassword, resume_filepath, role, otpCode, otpExpires, lastOtpSent, otpAttempts, blockExpires]
    );
    return { id: result.insertId };
}

async function findPendingSignupByEmail(email) {
    const [rows] = await pool.execute('SELECT * FROM pending_signups WHERE email = ?', [email]);
    return rows[0];
}

async function findPendingSignupByToken(token) {
    const [rows] = await pool.execute('SELECT * FROM pending_signups WHERE tempToken = ?', [token]);
    return rows[0];
}

async function updatePendingSignup(id, updates) {
    const fields = [];
    const values = [];
    for (const key in updates) {
        fields.push(`\`${key}\` = ?`);
        values.push(updates[key]);
    }
    if (fields.length === 0) return;

    values.push(id);
    await pool.execute(
        `UPDATE pending_signups SET ${fields.join(', ')} WHERE id = ?`,
        values
    );
}

async function deletePendingSignup(id) {
    await pool.execute('DELETE FROM pending_signups WHERE id = ?', [id]);
}

module.exports = {
    findUserByEmail,
    findUserByResetToken,
    findUserByVerificationToken,
    createUser,
    updateUser,
    createContact,
    createAnnouncement,
    getAllAnnouncements,
    getAnnouncementById,
    updateAnnouncement,
    deleteAnnouncement,
    createPendingSignup,
    findPendingSignupByEmail,
    findPendingSignupByToken,
    updatePendingSignup,
    deletePendingSignup
}; 