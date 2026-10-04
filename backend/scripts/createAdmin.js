require('dotenv').config({path:require('node:path').join(__dirname,'../.env')});
const bcrypt = require('bcryptjs');
const database = require('../src/config/database');
async function main() {
  const { ADMIN_EMAIL:email,ADMIN_NAME:name,ADMIN_PASSWORD:password } = process.env;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name?.trim() || !password || password.length<12 || Buffer.byteLength(password,'utf8')>72) throw new Error('Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD (12 characters minimum, 72 UTF-8 bytes maximum).');
  await database.initializeDatabase();
  if (await database.getUserByEmail(email)) throw new Error('Account already exists. No changes made.');
  await new Promise((resolve,reject)=>database.db.run("INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,'Admin','Active')",[name.trim(),email.trim().toLowerCase(),bcrypt.hashSync(password,12)],e=>e?reject(e):resolve()));
  console.log('Administrator created. Remove ADMIN_PASSWORD from the environment.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>database.db.close());
