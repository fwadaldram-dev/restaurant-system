const express = require('express');
const pool = require('./db');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// ==========================================
//           1. الأقسام (Categories API)
// ==========================================

app.post('/api/categories', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'اسم القسم مطلوب' });

        const newCategory = await pool.query(
            'INSERT INTO categories (name) VALUES ($1) RETURNING *',
            [name]
        );
        res.status(201).json({ message: 'تمت إضافة القسم بنجاح', category: newCategory.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        const allCategories = await pool.query('SELECT * FROM categories ORDER BY id ASC');
        res.json(allCategories.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
});

// ==========================================
//           2. الوجبات (Meals API)
// ==========================================

app.post('/api/meals', async (req, res) => {
    try {
        const { category_id, name, description, price, is_available } = req.body;
        if (!name || price === undefined) {
            return res.status(400).json({ error: 'اسم الوجبة والسعر مطلوبان' });
        }

        const newMeal = await pool.query(
            'INSERT INTO meals (category_id, name, description, price, is_available) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [category_id || null, name, description || null, price, is_available !== undefined ? is_available : true]
        );
        res.status(201).json({ message: 'تمت إضافة الوجبة بنجاح', meal: newMeal.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
});

app.get('/api/meals', async (req, res) => {
    try {
        const allMeals = await pool.query(`
            SELECT meals.*, categories.name AS category_name 
            FROM meals 
            LEFT JOIN categories ON meals.category_id = categories.id 
            ORDER BY meals.id ASC
        `);
        res.json(allMeals.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
});

// ==========================================
//           3. الطلبات (Orders API)
// ==========================================

app.post('/api/orders', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let { order_type, customer_name, customer_phone, delivery_address, payment_method, items } = req.body;

        if (!order_type || !items || items.length === 0) {
            return res.status(400).json({ error: 'بيانات الطلب غير مكتملة' });
        }

        if (order_type === 'Takeaway') {
            customer_name = customer_name || 'عميل مباشر (سفري)';
            customer_phone = customer_phone || 'N/A';
            delivery_address = null;
        } else if (order_type === 'Delivery') {
            if (!customer_name || !customer_phone) {
                return res.status(400).json({ error: 'اسم العميل ورقم الهاتف مطلوبان لطلبات التوصيل' });
            }
        }

        let total_amount = 0;
        for (let item of items) {
            const mealQuery = await client.query('SELECT price FROM meals WHERE id = $1', [item.meal_id]);
            if (mealQuery.rows.length === 0) {
                throw new Error(`الوجبة برقم ${item.meal_id} غير موجودة`);
            }
            const price = parseFloat(mealQuery.rows[0].price);
            total_amount += price * item.quantity;
        }

        const orderQuery = `
            INSERT INTO orders (order_type, customer_name, customer_phone, delivery_address, payment_method, total_amount)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;
        const orderValues = [order_type, customer_name, customer_phone, delivery_address || null, payment_method || 'Cash', total_amount];
        const newOrder = await client.query(orderQuery, orderValues);
        const orderId = newOrder.rows[0].id;

        for (let item of items) {
            const mealQuery = await client.query('SELECT price FROM meals WHERE id = $1', [item.meal_id]);
            const price = parseFloat(mealQuery.rows[0].price);

            await client.query(
                'INSERT INTO order_items (order_id, meal_id, quantity, price, notes) VALUES ($1, $2, $3, $4, $5)',
                [orderId, item.meal_id, item.quantity, price, item.notes || null]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({
            message: 'تم إنشاء الطلب بنجاح',
            order: newOrder.rows[0]
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('خطأ في إنشاء الطلب:', err.message);
        res.status(500).json({ error: err.message || 'حدث خطأ في السيرفر' });
    } finally {
        client.release();
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const allOrders = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
        res.json(allOrders.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
});

// ==========================================
// 4. مسار البحث والتخمين للعملاء (Autocomplete)
// ==========================================
app.get('/api/customers/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || query.trim().length === 0) {
            return res.json([]);
        }

        const searchResult = await pool.query(`
            SELECT DISTINCT ON (customer_phone) customer_name, customer_phone, delivery_address
            FROM orders
            WHERE order_type = 'Delivery' 
              AND (customer_name ILIKE $1 OR customer_phone ILIKE $1)
            ORDER BY customer_phone, id DESC
            LIMIT 10
        `, [`%${query}%`]);

        res.json(searchResult.rows);
    } catch (err) {
        console.error('خطأ في البحث عن العملاء:', err.message);
        res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:3000`);
});