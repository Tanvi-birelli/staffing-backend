import dotenv from "dotenv";

dotenv.config();

const GMAIL_USER= process.env.GMAIL_USER
const  GMAIL_APP_PASS=process.env.GMAIL_APP_PASS
const JWT_SECRET=process.env.JWT_SECRET
const SESSION_SECRET=process.env.SESSION_SECRET

const requiredEnv = [
  "GMAIL_USER",
  "GMAIL_APP_PASS",
  "JWT_SECRET",
  "SESSION_SECRET",
];

requiredEnv.forEach((key) => {
  if (!process.env[key]) throw new Error(`Missing env var: ${key}`);
});