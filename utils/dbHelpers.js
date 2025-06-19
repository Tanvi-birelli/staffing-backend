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

async function getJobseekerResumePathByUserId(userId) {
    const [rows] = await pool.execute(
        'SELECT resume_filepath FROM jobseeker WHERE user_id = ?',
        [userId]
    );
    return rows.length > 0 ? rows[0].resume_filepath : null;
}

// Modified to accept and store only the filename
async function updateJobseekerResumePath(userId, newResumeFilename) {
    await pool.execute(
        'UPDATE jobseeker SET resume_filepath = ? WHERE user_id = ?',
        [newResumeFilename, userId]
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

async function findJobs(queryParams) {
  let { q, experienceLevel, location, datePosted, isUrgent, page = 1, limit = 10, minSalary, maxSalary, employmentType } = queryParams;

  const MAX_LIMIT = 100;
  limit = Math.min(parseInt(limit), MAX_LIMIT);
  page = parseInt(page);

  let baseQuery = "SELECT * FROM jobs WHERE 1=1";
  let countQuery = "SELECT COUNT(*) AS total FROM jobs WHERE 1=1";
  const params = [];

  if (q) {
    const searchTerm = `%${q}%`;
    baseQuery += " AND (title LIKE ? OR company LIKE ? OR description LIKE ?)";
    countQuery += " AND (title LIKE ? OR company LIKE ? OR description LIKE ?)";
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (experienceLevel) {
    baseQuery += " AND experience = ?";
    countQuery += " AND experience = ?";
    params.push(experienceLevel);
  }

  if (location) {
    baseQuery += " AND location LIKE ?";
    countQuery += " AND location LIKE ?";
    params.push(`%${location}%`);
  }

  if (employmentType) {
    baseQuery += " AND type = ?";
    countQuery += " AND type = ?";
    params.push(employmentType);
  }

  if (minSalary && maxSalary) {
    const parsedMinSalary = parseFloat(minSalary);
    const parsedMaxSalary = parseFloat(maxSalary);
    if (!isNaN(parsedMinSalary) && !isNaN(parsedMaxSalary)) {
      baseQuery += " AND min_salary >= ? AND max_salary <= ?";
      countQuery += " AND min_salary >= ? AND max_salary <= ?";
      params.push(parsedMinSalary, parsedMaxSalary);
    }
  }

  if (datePosted) {
    const now = new Date();
    let dateFilter = null;
    if (datePosted === "last24hours") {
      dateFilter = new Date(now.setDate(now.getDate() - 1));
    } else if (datePosted === "last7days") {
      dateFilter = new Date(now.setDate(now.getDate() - 7));
    } else if (datePosted === "last30days") {
      dateFilter = new Date(now.setDate(now.getDate() - 30));
    }
    if (dateFilter) {
      baseQuery += " AND posted_date >= ?";
      countQuery += " AND posted_date >= ?";
      params.push(dateFilter.toISOString().slice(0, 19).replace('T', ' '));
    }
  }

  if (isUrgent === 'true') {
    baseQuery += " AND is_urgent = 1";
    countQuery += " AND is_urgent = 1";
  }

  const [totalJobsResult] = await pool.execute(countQuery, params);
  const totalJobs = totalJobsResult[0].total;
  const totalPages = Math.ceil(totalJobs / limit);
  const offset = (page - 1) * limit;

  const finalBaseQueryWithPagination = `${baseQuery} LIMIT ${limit} OFFSET ${offset}`;
  const [jobs] = await pool.execute(finalBaseQueryWithPagination, params);

  return { jobs, totalJobs, totalPages, currentPage: page, limit };
}

async function findJobById(jobId) {
  const [jobs] = await pool.execute("SELECT * FROM jobs WHERE id = ?", [jobId]);
  return jobs[0];
}

async function findAppliedJobs(jobseekerId, status) {
  let query = `
    SELECT
      ja.application_id,
      j.id AS jobId,
      j.title,
      j.company,
      j.location,
      CONCAT(j.currency, j.min_salary, ' - ', j.currency, j.max_salary) AS salary,
      j.openings,
      ja.application_date AS appliedDate,
      ja.status AS status,
      j.eligibility,
      j.description,
      j.work_mode,
      j.type,
      j.is_urgent AS isUrgent,
      j.is_new AS isNew
    FROM job_applications ja
    JOIN jobs j ON ja.job_id = j.id
    WHERE ja.jobseeker_id = ?`;
  const params = [jobseekerId];

  if (status) {
    query += " AND ja.status = ?";
    params.push(status);
  }

  const [appliedJobs] = await pool.execute(query, params);
  return appliedJobs;
}

async function checkJobExists(jobId) {
  const [jobs] = await pool.execute("SELECT id FROM jobs WHERE id = ?", [jobId]);
  return jobs.length > 0;
}

async function findExistingApplication(jobId, jobseekerId) {
  const [existingApplication] = await pool.execute(
    "SELECT application_id FROM job_applications WHERE job_id = ? AND jobseeker_id = ?",
    [jobId, jobseekerId]
  );
  return existingApplication.length > 0;
}

async function createJobApplication(jobId, jobseekerId, resumeFilepath, status) {
  const [result] = await pool.execute(
    "INSERT INTO job_applications (job_id, jobseeker_id, resume_filepath, status) VALUES (?, ?, ?, ?)",
    [jobId, jobseekerId, resumeFilepath, status]
  );
  return result.insertId;
}

async function findScheduleByUserId(userId, startDate, endDate) {
  let query = `
    SELECT
      se.event_id AS id,
      se.event_type AS type,
      se.title AS title,
      se.event_datetime AS date,
      se.location AS location,
      se.description AS description,
      -- Interview specific details
      i.interview_id,
      i.interview_type,
      i.interviewer_id,
      i.status AS interviewStatus,
      i.notes AS interviewNotes,
      -- Job Application details
      ja.application_id,
      ja.status AS applicationStatus,
      -- Job details
      j.id AS jobId,
      j.title AS jobTitle,
      j.company AS companyName
    FROM scheduled_events se
    LEFT JOIN interviews i ON se.event_id = i.scheduled_event_id AND se.event_type = 'interview'
    LEFT JOIN job_applications ja ON i.application_id = ja.application_id
    LEFT JOIN jobs j ON ja.job_id = j.id
    WHERE se.user_id = ?
  `;
  const params = [userId];

  if (startDate) {
    query += ` AND se.event_datetime >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND se.event_datetime <= ?`;
    params.push(endDate);
  }

  query += ` ORDER BY se.event_datetime ASC`;

  const [schedules] = await pool.execute(query, params);
  return schedules;
}

async function findNotificationsByUserId(userId, date, readStatus, type) {
  let query = "SELECT * FROM notifications WHERE user_id = ?";
  const params = [userId];

  if (date) {
    query += " AND DATE(created_at) = ?";
    params.push(date);
  }
  if (readStatus !== undefined) {
    query += " AND is_read = ?";
    params.push(readStatus === 'true' ? 1 : 0);
  }
  if (type) {
    query += " AND type = ?";
    params.push(type);
  }

  const [notifications] = await pool.execute(query, params);
  return notifications;
}

async function countUnreadNotifications(userId) {
  const [unreadCountResult] = await pool.execute(
    "SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND is_read = FALSE",
    [userId]
  );
  return unreadCountResult[0].unreadCount;
}

async function updateNotificationReadStatus(notificationId, userId, readStatus) {
  const [result] = await pool.execute(
    "UPDATE notifications SET is_read = ? WHERE notification_id = ? AND user_id = ?",
    [readStatus ? 1 : 0, notificationId, userId]
  );
  return result.affectedRows;
}

async function markAllNotificationsRead(userId) {
  const [result] = await pool.execute("UPDATE notifications SET is_read = TRUE WHERE user_id = ?", [userId]);
  return result.affectedRows; // Return affected rows for confirmation
}

async function deleteNotificationById(notificationId, userId) {
  const [result] = await pool.execute(
    "DELETE FROM notifications WHERE notification_id = ? AND user_id = ?",
    [notificationId, userId]
  );
  return result.affectedRows;
}

async function findUpcomingNotifications(userId) {
  const today = new Date();
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const [upcomingNotifications] = await pool.execute(
    "SELECT * FROM notifications WHERE user_id = ? AND is_read = FALSE AND DATE(created_at) >= DATE(?) AND DATE(created_at) <= DATE(?) ORDER BY created_at ASC",
    [userId, today.toISOString().slice(0, 10), sevenDaysFromNow.toISOString().slice(0, 10)]
  );
  return upcomingNotifications;
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
    getJobseekerResumePathByUserId,
    findMaxVoatIdSuffix,
    findJobs,
    findJobById,
    findAppliedJobs,
    checkJobExists,
    findExistingApplication,
    createJobApplication,
    findScheduleByUserId,
    findNotificationsByUserId,
    countUnreadNotifications,
    updateNotificationReadStatus,
    markAllNotificationsRead,
    deleteNotificationById,
    findUpcomingNotifications
}; 