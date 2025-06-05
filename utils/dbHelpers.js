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
    const currentTime = Date.now();
    console.log(`Debug: findUserByResetToken - Token: ${token}, Current Time (ms): ${currentTime}, Current Time (Date): ${new Date(currentTime).toLocaleString()}`);
    const [rows] = await pool.execute('SELECT * FROM users WHERE resetToken = ? AND resetExpires > ?', [token, currentTime]);
    if (rows[0]) {
        console.log(`Debug: findUserByResetToken - Found user. User ID: ${rows[0].id}, Stored resetExpires (ms): ${rows[0].resetExpires}, Stored resetExpires (Date): ${new Date(rows[0].resetExpires).toLocaleString()}`);
    }
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
            'INSERT INTO jobseeker (user_id, resume_filepath) VALUES (?, ?)',
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

async function findJobseekerProfileByUserId(userId) {
    const [rows] = await pool.execute(
        `SELECT
            u.id AS userId,
            u.username,
            u.email,
            u.role,
            u.voat_id,
            u.verified,
            u.name,
            u.phone,
            u.gender,
            u.address,
            u.whatsapp,
            j.resume_filepath,
            j.bio,
            j.portfolio,
            j.education,
            j.experience_years,
            j.skills,
            j.projects,
            j.certifications,
            j.parent_name AS parentDetails_name,
            j.parent_phone AS parentDetails_phone,
            j.parent_relation AS parentDetails_relation,
            j.parent_email AS parentDetails_email
        FROM
            users u
        JOIN
            jobseeker j ON u.id = j.user_id
        WHERE
            u.id = ? AND u.role = 'jobseeker'`,
        [userId]
    );
    if (rows.length === 0) return null;

    const profile = rows[0];
    // Restructure parentDetails for a cleaner API response
    profile.parentDetails = {
        name: profile.parentDetails_name,
        phone: profile.parentDetails_phone,
        relation: profile.parentDetails_relation,
        email: profile.parentDetails_email,
    };
    delete profile.parentDetails_name;
    delete profile.parentDetails_phone;
    delete profile.parentDetails_relation;
    delete profile.parentDetails_email;

    return profile;
}

async function updateJobseekerProfile(userId, profileUpdates) {
    const userUpdates = {};
    const jobseekerUpdates = {};
    const parentDetailsUpdates = {};

    // Define which fields belong to which table
    const userFields = ['name', 'phone', 'gender', 'address', 'whatsapp'];
    const jobseekerFields = ['bio', 'portfolio', 'education', 'experience_years', 'skills', 'projects', 'certifications'];

    for (const key in profileUpdates) {
        if (userFields.includes(key)) {
            userUpdates[key] = profileUpdates[key];
        } else if (jobseekerFields.includes(key)) {
            // Convert JSON fields to string if they are arrays/objects
            if (['skills', 'projects', 'certifications'].includes(key)) {
                jobseekerUpdates[key] = JSON.stringify(profileUpdates[key]);
            } else {
                jobseekerUpdates[key] = profileUpdates[key];
            }
        } else if (key === 'parentDetails') {
            // Handle parentDetails separately
            parentDetailsUpdates.parent_name = profileUpdates.parentDetails.name;
            parentDetailsUpdates.parent_phone = profileUpdates.parentDetails.phone;
            parentDetailsUpdates.parent_relation = profileUpdates.parentDetails.relation;
            parentDetailsUpdates.parent_email = profileUpdates.parentDetails.email;
        }
    }

    // Perform updates only if there are fields to update for each table
    if (Object.keys(userUpdates).length > 0) {
        const fields = [];
        const values = [];
        for (const key in userUpdates) {
            fields.push(`\`${key}\` = ?`);
            values.push(userUpdates[key]);
        }
        values.push(userId);
        await pool.execute(
            `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
    }

    const finalJobseekerUpdates = { ...jobseekerUpdates, ...parentDetailsUpdates };
    if (Object.keys(finalJobseekerUpdates).length > 0) {
        const fields = [];
        const values = [];
        for (const key in finalJobseekerUpdates) {
            fields.push(`\`${key}\` = ?`);
            values.push(finalJobseekerUpdates[key]);
        }
        values.push(userId);
        await pool.execute(
            `UPDATE jobseeker SET ${fields.join(', ')} WHERE user_id = ?`,
            values
        );
    }

    return true; // Indicate success
}

async function updateJobseekerResumePath(userId, resumePath) {
    await pool.execute(
        'UPDATE jobseeker SET resume_filepath = ? WHERE user_id = ?',
        [resumePath, userId]
    );
    return true;
}

async function findMaxVoatIdSuffix() {
    // This query extracts the numeric part of the VOAT-ID and finds the maximum.
    // It assumes VOAT-ID is always in the format 'VOAT-XXX' where XXX is numeric.
    const [rows] = await pool.execute(
        `SELECT MAX(CAST(SUBSTRING_INDEX(voat_id, '-', -1) AS UNSIGNED)) AS max_suffix FROM users WHERE voat_id LIKE 'VOAT-%'`
    );
    return rows[0].max_suffix || 0; // Return 0 if no VOAT-IDs exist
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
    deletePendingSignup,
    findJobseekerProfileByUserId,
    updateJobseekerProfile,
    updateJobseekerResumePath,
    findMaxVoatIdSuffix
}; 