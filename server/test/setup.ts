import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.QR_SECRET_SALT = process.env.QR_SECRET_SALT || 'test-qr-salt';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gimawi_test';
process.env.NODE_ENV = 'test';
process.env.TRUST_PROXY = 'false';
