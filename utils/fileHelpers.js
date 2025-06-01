const fs = require("fs");

// File helpers for jobseeker module
// const loadJSON = (file) => {
//   try {
//     const data = fs.readFileSync(`./data/${file}`);
//     return JSON.parse(data);
//   } catch {
//     return [];
//   }
// };

// const saveJSON = (file, data) => {
//   fs.writeFileSync(`./data/${file}`, JSON.stringify(data, null, 2));
// };

// const getNextIds = () => {
//   try {
//     return JSON.parse(fs.readFileSync("./data/meta.json"));
//   } catch {
//     return { userId: 0, voatId: 0 };
//   }
// };

// const updateIds = (type) => {
//   const meta = getNextIds();
//   meta[type] += 1;
//   fs.writeFileSync("./data/meta.json", JSON.stringify(meta));
//   return meta[type];
// };

// File-based user storage helpers
// const loadUsers = () => {
//   try {
//     const data = fs.readFileSync("./data/users.json", "utf8").trim();
//     return data ? JSON.parse(data) : [];
//   } catch (e) {
//     return [];
//   }
// };

// const saveUsers = (users) => {
//   fs.writeFileSync("./data/users.json", JSON.stringify(users, null, 2));
// };

const loadContacts = () => {
  try {
    const data = fs.readFileSync("./data/contacts.json");
    return JSON.parse(data);
  } catch {
    return [];
  }
};

const saveContacts = (contacts) => {
  fs.writeFileSync("./data/contacts.json", JSON.stringify(contacts, null, 2));
};

const loadAnnouncements = () => {
  try {
    const data = fs.readFileSync("./data/announcements.json");
    return JSON.parse(data);
  } catch {
    return [];
  }
};

const saveAnnouncements = (announcements) => {
  fs.writeFileSync(
    "./data/announcements.json",
    JSON.stringify(announcements, null, 2)
  );
};

module.exports = {
    // loadJSON,
    // saveJSON,
    // getNextIds,
    // updateIds,
    // loadUsers,
    // saveUsers,
    loadContacts,
    saveContacts,
    loadAnnouncements,
    saveAnnouncements
}; 