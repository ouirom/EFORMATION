#!/usr/bin/env node
const bcrypt = require('bcryptjs');

const password = 'Admin123!';
const hash = bcrypt.hashSync(password, 12);
console.log('Hash for "Admin123!":', hash);
