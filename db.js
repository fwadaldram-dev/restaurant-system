const { Pool } = require('pg');

// إعدادات الاتصال بقاعدة البيانات
const pool = new Pool({
    user: 'postgres',          // اسم المستخدم الافتراضي
    host: 'localhost',         // السيرفر المحلي
    database: 'restaurant_db', // اسم قاعدة البيانات التي أنشأناها
    password: '77770', // استبدل هذه الكلمة بكلمة المرور التي كتبتها أثناء تثبيت PostgreSQL
    port: 5432,                // المنفذ الافتراضي
});

// اختبار الاتصال
pool.connect()
    .then(() => console.log('Connected to PostgreSQL Database successfully!'))
    .catch(err => console.error('Connection error', err.stack));

module.exports = pool;